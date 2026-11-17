import type { CoverItem } from "@/types/artist";
import { useUserStore } from "@/stores/user";
import { fetchRecommendPlaylists, fetchRadarPlaylists } from "@/apis/recommend/netease";

/** 首页推荐内容缓存有效期 */
const CACHE_TTL = 30 * 60 * 1000;

/** 首页推荐内容缓存 */
interface DiscoverCache {
  at: number;
  userId: number | null;
  recommend: CoverItem[];
  radar: CoverItem[];
}

/** 模块级缓存，跨页面 / 重新挂载复用 */
let cache: DiscoverCache | null = null;

/**
 * 单区块失败不影响其他推荐
 * @param label - 日志中的区块名
 * @param task - 推荐请求
 * @returns 推荐列表，失败时为空
 */
const safe = (label: string, task: Promise<CoverItem[]>): Promise<CoverItem[]> =>
  task.catch((error) => {
    console.warn(`[home] ${label} failed:`, error);
    return [];
  });

/**
 * 首页推荐内容
 *
 * 仅拉取推荐歌单与雷达，按账号复用 30 分钟内的单份缓存
 * @returns 推荐区块与加载方法
 */
export const useHomeDiscover = () => {
  const { t } = useI18n();
  const user = useUserStore();
  let loadVersion = 0;

  /** 推荐歌单 / 专属歌单 */
  const recommendPlaylists = shallowRef<CoverItem[]>([]);
  /** 雷达歌单 */
  const radarPlaylists = shallowRef<CoverItem[]>([]);

  /** 推荐歌单标题 */
  const recommendTitle = computed(() =>
    user.isLoggedIn ? t("home.recommend.title") : t("home.recommend.titleGuest"),
  );
  /** 推荐歌单副标题 */
  const recommendSubtitle = computed(() =>
    user.isLoggedIn ? t("home.recommend.subtitle") : t("home.recommend.subtitleGuest"),
  );

  /**
   * 应用当前账号的推荐缓存
   * @param data - 缓存内容
   */
  const apply = (data: DiscoverCache): void => {
    recommendPlaylists.value = data.recommend;
    radarPlaylists.value = data.radar;
  };

  /** 拉取首页推荐内容 */
  const load = async (): Promise<void> => {
    const version = ++loadVersion;
    const userId = user.profile?.userId ?? null;
    const loggedIn = user.isLoggedIn;
    if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_TTL) {
      apply(cache);
      return;
    }
    const [recommend, radar] = await Promise.all([
      safe("recommend playlists", fetchRecommendPlaylists(loggedIn)),
      loggedIn ? safe("radar playlists", fetchRadarPlaylists()) : Promise.resolve<CoverItem[]>([]),
    ]);
    if (version !== loadVersion || userId !== (user.profile?.userId ?? null)) return;
    cache = { at: Date.now(), userId, recommend, radar };
    apply(cache);
  };

  watch(
    () => user.profile?.userId,
    () => {
      recommendPlaylists.value = [];
      radarPlaylists.value = [];
      void load();
    },
  );

  onScopeDispose(() => {
    loadVersion++;
  });

  return {
    recommendPlaylists,
    recommendTitle,
    recommendSubtitle,
    radarPlaylists,
    load,
  };
};
