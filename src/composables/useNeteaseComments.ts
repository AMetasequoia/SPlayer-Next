import type { Ref } from "vue";
import type { MusicCommentItem, NeteaseCommentTarget } from "@shared/types/comment";
import { isNeteaseCommentTarget } from "@shared/utils/comments";
import { useUserStore } from "@/stores/user";
import { toast } from "@/composables/useToast";

/** 当前页面最多保留最近 400 条全部评论，不建立全局分页缓存 */
const MAX_COMMENTS = 400;

/**
 * 管理网易云评论的局部分页与点赞，资源、账号变更和卸载后作废迟到结果
 * @param target - 当前网易云资源
 */
export const useNeteaseComments = (target: Ref<NeteaseCommentTarget | null>) => {
  const user = useUserStore();
  const { t } = useI18n();
  const hot = shallowRef<MusicCommentItem[]>([]);
  const comments = shallowRef<MusicCommentItem[]>([]);
  const total = ref(0);
  const hasMore = ref(false);
  const trimmed = ref(false);
  const hotLoading = ref(false);
  const loading = ref(false);
  const hotError = ref("");
  const error = ref("");
  const pendingLikes = shallowRef(new Set<string>());
  let version = 0;
  let page = 0;
  let cursor: string | undefined;
  let session: number | undefined;

  /**
   * 读取热门或下一批全部评论，只有成功才推进分页游标
   * @param type - 评论分区
   */
  const load = async (type: "hot" | "new"): Promise<void> => {
    const resource = target.value;
    if (!resource || !isNeteaseCommentTarget(resource)) return;
    const busy = type === "hot" ? hotLoading : loading;
    const failure = type === "hot" ? hotError : error;
    if (busy.value || pendingLikes.value.size > 0 || (type === "new" && page > 0 && !hasMore.value))
      return;
    const token = version;
    busy.value = true;
    failure.value = "";
    try {
      const result = await window.api.comments.resource({
        target: { ...resource },
        type,
        page: type === "hot" ? 1 : page + 1,
        cursor,
      });
      if (token !== version) return;
      if (!result.ok) throw new Error(result.error);
      if (session !== undefined && session !== result.data.session) {
        throw new Error(t("comments.sessionChanged"));
      }
      session = result.data.session;
      if (type === "hot") hot.value = result.data.list;
      else {
        const known = new Set(comments.value.map((item) => item.id));
        const fresh = result.data.list.filter((item) => {
          if (known.has(item.id)) return false;
          known.add(item.id);
          return true;
        });
        const combined = [...comments.value, ...fresh];
        if (combined.length > MAX_COMMENTS) trimmed.value = true;
        comments.value = combined.slice(-MAX_COMMENTS);
        total.value = result.data.total;
        page = result.data.page;
        cursor = result.data.nextCursor;
        hasMore.value = result.data.hasMore;
      }
    } catch (err) {
      if (token === version) failure.value = err instanceof Error ? err.message : String(err);
    } finally {
      if (token === version) busy.value = false;
    }
  };

  /** 清空本页数据与写入状态，重新加载热门和首批评论 */
  const refresh = (): void => {
    version++;
    hot.value = [];
    comments.value = [];
    total.value = 0;
    hasMore.value = false;
    trimmed.value = false;
    hotLoading.value = false;
    loading.value = false;
    hotError.value = "";
    error.value = "";
    pendingLikes.value = new Set();
    page = 0;
    cursor = undefined;
    session = undefined;
    if (!target.value || !isNeteaseCommentTarget(target.value)) return;
    void load("hot");
    void load("new");
  };

  /**
   * 用户点击后提交点赞，成功才更新两个分区中的同一评论
   * @param item - 当前页面的评论
   */
  const toggleLike = async (item: MusicCommentItem): Promise<void> => {
    if (!user.isLoggedIn) {
      toast.warning(t("comments.needLogin"));
      return;
    }
    if (
      !target.value ||
      session === undefined ||
      loading.value ||
      hotLoading.value ||
      pendingLikes.value.has(item.id)
    )
      return;
    const token = version;
    const liked = !item.liked;
    pendingLikes.value = new Set([...pendingLikes.value, item.id]);
    try {
      const result = await window.api.comments.setLiked({
        target: { ...target.value },
        commentId: item.id,
        liked,
        session,
      });
      if (token !== version) return;
      if (!result.ok) throw new Error(result.error);
      /** 将已确认的点赞同步到当前两区，不保留跨页写入缓存 */
      const update = (list: MusicCommentItem[]): MusicCommentItem[] =>
        list.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                liked,
                likedCount: Math.max(
                  0,
                  (entry.likedCount ?? 0) + (entry.liked === liked ? 0 : liked ? 1 : -1),
                ),
              }
            : entry,
        );
      hot.value = update(hot.value);
      comments.value = update(comments.value);
    } catch (err) {
      if (token === version) toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      if (token === version) {
        const next = new Set(pendingLikes.value);
        next.delete(item.id);
        pendingLikes.value = next;
      }
    }
  };

  watch(
    [
      () => target.value?.type,
      () => target.value?.id,
      () => user.isLoggedIn,
      () => user.profile?.userId,
    ],
    refresh,
    { immediate: true, flush: "sync" },
  );
  onBeforeUnmount(() => {
    version++;
    hot.value = [];
    comments.value = [];
    pendingLikes.value = new Set();
  });

  return {
    hot,
    comments,
    total,
    hasMore,
    trimmed,
    hotLoading,
    loading,
    hotError,
    error,
    pendingLikes,
    refresh,
    load,
    toggleLike,
  };
};
