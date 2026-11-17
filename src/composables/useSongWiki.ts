import type { Ref } from "vue";
import type { Track } from "@shared/types/player";
import type { SongWiki, WikiSheetState } from "@/types/wiki";
import { songsByIds } from "@/apis/song/netease";
import {
  getWikiTrack,
  getWikiSummary,
  getWikiStory,
  getWikiSheets,
  getWikiSheetPreview,
  normalizeSongWiki,
} from "@/apis/song/wiki";
import { useUserStore } from "@/stores/user";

/**
 * 加载当前页面的百科，切歌、换账号或卸载后丢弃迟到结果
 * @param id - 当前路由的网易云歌曲 ID
 * @returns 页面状态与重试、乐谱按需加载方法
 */
export const useSongWiki = (id: Ref<string>) => {
  const user = useUserStore();
  const track = shallowRef<Track | null>(null);
  const publishTime = ref<number>();
  const wiki = shallowRef<SongWiki | null>(null);
  const sheets = ref<WikiSheetState[]>([]);
  const similarTracks = shallowRef<Track[]>([]);
  const similarLoading = ref(false);
  const loading = ref(false);
  const failed = ref(false);
  const partialFailure = ref(false);
  let version = 0;

  /** 重新加载当前歌曲与账号的数据，不保留跨页面缓存 */
  const load = async (): Promise<void> => {
    const token = ++version;
    const songId = id.value;
    track.value = null;
    publishTime.value = undefined;
    wiki.value = null;
    sheets.value = [];
    similarTracks.value = [];
    similarLoading.value = false;
    failed.value = false;
    partialFailure.value = false;
    if (!/^[1-9]\d*$/.test(songId)) {
      failed.value = true;
      loading.value = false;
      return;
    }
    loading.value = true;
    const [detail, summary, story, sheetList] = await Promise.allSettled([
      getWikiTrack(songId),
      getWikiSummary(songId),
      user.isLoggedIn ? getWikiStory(songId) : Promise.resolve({}),
      getWikiSheets(songId),
    ]);
    if (token !== version) return;
    loading.value = false;
    if (detail.status !== "fulfilled" || !detail.value.track) {
      failed.value = true;
      return;
    }
    track.value = detail.value.track;
    publishTime.value = detail.value.publishTime;
    partialFailure.value = [summary, story, sheetList].some(
      (result) => result.status === "rejected",
    );
    wiki.value = normalizeSongWiki(
      summary.status === "fulfilled" ? summary.value : {},
      story.status === "fulfilled" ? story.value : {},
    );
    if (sheetList.status === "fulfilled") {
      sheets.value = sheetList.value.map((sheet) => ({
        ...sheet,
        images: [],
        loading: false,
        loaded: false,
        error: false,
      }));
    }
    if (!wiki.value.similarIds.length) return;
    similarLoading.value = true;
    try {
      const tracks = await songsByIds(wiki.value.similarIds);
      if (token === version) similarTracks.value = tracks;
    } catch {
      if (token === version) partialFailure.value = true;
    } finally {
      if (token === version) similarLoading.value = false;
    }
  };

  /**
   * 展开乐谱时再请求图片，重复展开不重复请求；失败允许重试
   * @param sheetId - 当前页面的乐谱 ID
   */
  const loadSheet = async (sheetId: string): Promise<void> => {
    const sheet = sheets.value.find((item) => item.id === sheetId);
    if (!sheet || sheet.loading || sheet.loaded) return;
    const token = version;
    sheet.loading = true;
    sheet.error = false;
    try {
      const images = await getWikiSheetPreview(sheetId);
      if (token !== version) return;
      sheet.images = images;
      sheet.loaded = true;
    } catch {
      if (token === version) sheet.error = true;
    } finally {
      if (token === version) sheet.loading = false;
    }
  };

  watch([id, () => user.isLoggedIn, () => user.profile?.userId], () => void load(), {
    immediate: true,
    flush: "sync",
  });
  onBeforeUnmount(() => {
    version++;
  });

  return {
    track,
    publishTime,
    wiki,
    sheets,
    similarTracks,
    similarLoading,
    loading,
    failed,
    partialFailure,
    load,
    loadSheet,
  };
};
