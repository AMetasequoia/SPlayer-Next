import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { defineComponent, reactive, shallowRef } from "vue";
import type { Track } from "@shared/types/player";
import type { WikiStory, WikiSummary } from "@/types/wiki";
import { useSongWiki } from "./useSongWiki";

const mocks = vi.hoisted(() => ({
  user: {} as { profile: { userId: number } | null; isLoggedIn: boolean },
  detail: vi.fn(),
  summary: vi.fn(),
  story: vi.fn(),
  sheets: vi.fn(),
  preview: vi.fn(),
  similar: vi.fn(),
}));
vi.mock("@/stores/user", () => ({ useUserStore: () => mocks.user }));
vi.mock("@/apis/song/netease", () => ({ songsByIds: mocks.similar }));
vi.mock("@/apis/song/wiki", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/apis/song/wiki")>()),
  getWikiTrack: mocks.detail,
  getWikiSummary: mocks.summary,
  getWikiStory: mocks.story,
  getWikiSheets: mocks.sheets,
  getWikiSheetPreview: mocks.preview,
}));

const song: Track = { id: "10", title: "歌曲", artists: [], source: "netease", duration: 1000 };
const id = shallowRef("10");
let wrapper: VueWrapper;
let state: ReturnType<typeof useSongWiki>;

/** 挂载真实生命周期下的百科加载器 */
const start = (): void => {
  wrapper = mount(
    defineComponent({
      setup() {
        state = useSongWiki(id);
        return () => null;
      },
    }),
  );
};

/**
 * 生成可手动控制的迟到请求
 * @returns 请求 Promise 与完成方法
 */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.resetAllMocks();
  id.value = "10";
  mocks.user = reactive({
    profile: { userId: 1 } as { userId: number } | null,
    get isLoggedIn() {
      return this.profile !== null;
    },
  });
  mocks.detail.mockResolvedValue({ track: song, publishTime: 1234 });
  mocks.summary.mockResolvedValue({ blocks: [] });
  mocks.story.mockResolvedValue({ musicTotalPlayDto: { playCount: 5 } });
  mocks.sheets.mockResolvedValue([{ id: "9007199254740993", name: "乐谱" }]);
  mocks.preview.mockResolvedValue(["https://img/preview"]);
  mocks.similar.mockResolvedValue([{ ...song, id: "20" }]);
});
afterEach(() => wrapper?.unmount());

describe("百科页面请求与生命周期", () => {
  it("加载歌曲与三类百科信息，乐谱展开才请求且在途、已加载不重复", async () => {
    start();
    expect(state.loading.value).toBe(true);
    await flushPromises();
    expect(state.track.value).toEqual(song);
    expect(state.publishTime.value).toBe(1234);
    expect(state.wiki.value?.story.musicTotalPlayDto?.playCount).toBe(5);
    expect(mocks.preview).not.toHaveBeenCalled();
    const pending = deferred<string[]>();
    mocks.preview.mockReturnValueOnce(pending.promise);
    const loading = state.loadSheet("9007199254740993");
    await state.loadSheet("9007199254740993");
    expect(mocks.preview).toHaveBeenCalledOnce();
    pending.resolve(["https://img/new"]);
    await loading;
    await state.loadSheet("9007199254740993");
    expect(mocks.preview).toHaveBeenCalledOnce();
    expect(state.sheets.value[0].images).toEqual(["https://img/new"]);
    expect(state.loading.value).toBe(false);
  });

  it("游客保留公共百科，不请求个人记录", async () => {
    mocks.user.profile = null;
    start();
    await flushPromises();
    expect(mocks.story).not.toHaveBeenCalled();
    expect(mocks.summary).toHaveBeenCalledWith("10");
    expect(state.failed.value).toBe(false);
  });

  it.each(["summary", "story", "sheets"] as const)(
    "%s 失败时保留其他内容并明确标记部分失败，重试可恢复",
    async (part) => {
      mocks[part].mockRejectedValueOnce(new Error("offline"));
      start();
      await flushPromises();
      expect(state.track.value).toEqual(song);
      expect(state.failed.value).toBe(false);
      expect(state.partialFailure.value).toBe(true);
      await state.load();
      expect(state.partialFailure.value).toBe(false);
    },
  );

  it.each([null, "error"])("歌曲不存在或失败时退出加载态，允许重试：%s", async (value) => {
    if (value === null) mocks.detail.mockResolvedValueOnce({ track: null });
    else mocks.detail.mockRejectedValueOnce(new Error("offline"));
    start();
    await flushPromises();
    expect(state.loading.value).toBe(false);
    expect(state.failed.value).toBe(true);
    expect(state.track.value).toBeNull();
    await state.load();
    expect(state.failed.value).toBe(false);
  });

  it.each(["", "0", "abc", "1.5", "-1"])("无效歌曲 ID %s 不发请求且不无限加载", async (value) => {
    id.value = value;
    start();
    await flushPromises();
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(mocks.summary).not.toHaveBeenCalled();
    expect(state.failed.value).toBe(true);
    expect(state.loading.value).toBe(false);
  });

  it("切换歌曲后旧正文不能覆盖当前页面", async () => {
    const pending = deferred<WikiSummary>();
    mocks.summary.mockReturnValueOnce(pending.promise);
    start();
    mocks.detail.mockResolvedValue({ track: { ...song, id: "20" } });
    id.value = "20";
    await flushPromises();
    expect(mocks.summary).toHaveBeenLastCalledWith("20");
    pending.resolve({ musicTotalPlayDto: { playCount: 999 } });
    await flushPromises();
    expect(state.track.value?.id).toBe("20");
    expect(state.wiki.value?.story.musicTotalPlayDto?.playCount).toBe(5);
  });

  it("换账号立刻清除个人记录，迟到的旧账号响应不回写", async () => {
    const pending = deferred<WikiStory>();
    mocks.story.mockReturnValueOnce(pending.promise);
    start();
    mocks.story.mockResolvedValue({ musicTotalPlayDto: { playCount: 2 } });
    mocks.user.profile = { userId: 2 };
    expect(state.wiki.value).toBeNull();
    await flushPromises();
    expect(state.wiki.value?.story.musicTotalPlayDto?.playCount).toBe(2);
    pending.resolve({ musicTotalPlayDto: { playCount: 999 } });
    await flushPromises();
    expect(state.wiki.value?.story.musicTotalPlayDto?.playCount).toBe(2);
    mocks.user.profile = null;
    expect(state.wiki.value).toBeNull();
    await flushPromises();
    expect(state.wiki.value?.story.musicTotalPlayDto).toBeUndefined();
  });

  it("乐谱失败允许重试，空预览已完成不重复请求", async () => {
    mocks.preview.mockRejectedValueOnce(new Error("offline"));
    start();
    await flushPromises();
    await state.loadSheet("9007199254740993");
    expect(state.sheets.value[0].error).toBe(true);
    mocks.preview.mockResolvedValueOnce([]);
    await state.loadSheet("9007199254740993");
    expect(state.sheets.value[0]).toMatchObject({
      error: false,
      loaded: true,
      loading: false,
      images: [],
    });
    await state.loadSheet("9007199254740993");
    expect(mocks.preview).toHaveBeenCalledTimes(2);
  });

  it("重载时旧乐谱图片不会写入新页面", async () => {
    start();
    await flushPromises();
    const pending = deferred<string[]>();
    mocks.preview.mockReturnValueOnce(pending.promise);
    const oldLoad = state.loadSheet("9007199254740993");
    await state.load();
    pending.resolve(["https://img/old"]);
    await oldLoad;
    expect(state.sheets.value[0]).toMatchObject({ images: [], loading: false });
  });

  it("相似歌曲使用播放 ID，失败不影响主体，迟到结果不能覆盖新页面", async () => {
    const pending = deferred<Track[]>();
    mocks.summary.mockResolvedValueOnce({
      blocks: [
        {
          code: "SONG_PLAY_ABOUT_SIMILAR_SONG",
          creatives: [{ resources: [{ resourceId: "9007199254740993" }] }],
        },
      ],
    });
    mocks.similar.mockReturnValueOnce(pending.promise);
    start();
    await flushPromises();
    expect(mocks.similar).toHaveBeenCalledWith(["9007199254740993"]);
    expect(state.track.value).toEqual(song);
    expect(state.similarLoading.value).toBe(true);
    await state.load();
    expect(state.similarLoading.value).toBe(false);
    pending.resolve([{ ...song, id: "old-similar" }]);
    await flushPromises();
    expect(state.similarTracks.value).toEqual([]);
  });

  it("旧相似歌曲响应不能提前结束新请求的加载状态", async () => {
    const oldRequest = deferred<Track[]>();
    const nextRequest = deferred<Track[]>();
    mocks.summary.mockResolvedValue({
      blocks: [
        {
          code: "SONG_PLAY_ABOUT_SIMILAR_SONG",
          creatives: [{ resources: [{ resourceId: "20" }] }],
        },
      ],
    });
    mocks.similar.mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(nextRequest.promise);
    start();
    await flushPromises();
    const nextLoad = state.load();
    await flushPromises();
    oldRequest.resolve([{ ...song, id: "old" }]);
    await flushPromises();
    expect(state.similarLoading.value).toBe(true);
    expect(state.similarTracks.value).toEqual([]);
    nextRequest.resolve([{ ...song, id: "new" }]);
    await nextLoad;
    expect(state.similarLoading.value).toBe(false);
    expect(state.similarTracks.value[0].id).toBe("new");
  });

  it("相似歌曲请求失败保留主体，并显示部分失败状态", async () => {
    mocks.summary.mockResolvedValueOnce({
      blocks: [
        {
          code: "SONG_PLAY_ABOUT_SIMILAR_SONG",
          creatives: [{ resources: [{ resourceId: "20" }] }],
        },
      ],
    });
    mocks.similar.mockRejectedValueOnce(new Error("offline"));
    start();
    await flushPromises();
    expect(state.track.value).toEqual(song);
    expect(state.similarTracks.value).toEqual([]);
    expect(state.similarLoading.value).toBe(false);
    expect(state.failed.value).toBe(false);
    expect(state.partialFailure.value).toBe(true);
  });

  it("卸载后乐谱预览响应不再更新页面状态", async () => {
    start();
    await flushPromises();
    const pending = deferred<string[]>();
    mocks.preview.mockReturnValueOnce(pending.promise);
    const oldLoad = state.loadSheet("9007199254740993");
    wrapper.unmount();
    pending.resolve(["https://img/late"]);
    await oldLoad;
    expect(state.sheets.value[0].images).toEqual([]);
    expect(state.sheets.value[0].loaded).toBe(false);
  });

  it("卸载后迟到的主请求不发布数据", async () => {
    const pending = deferred<WikiSummary>();
    mocks.summary.mockReturnValueOnce(pending.promise);
    start();
    wrapper.unmount();
    pending.resolve({});
    await flushPromises();
    expect(state.track.value).toBeNull();
    expect(state.wiki.value).toBeNull();
  });
});
