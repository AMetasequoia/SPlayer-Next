import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { computed, reactive, ref, shallowRef } from "vue";
import { createI18n } from "vue-i18n";
import type { Track } from "@shared/types/player";
import type { SongWiki, WikiSheetState } from "@/types/wiki";
import type { useSongWiki } from "@/composables/useSongWiki";
import zhCN from "@/i18n/locales/zh-CN.json";
import SongWikiPage from "./SongWiki.vue";

const mocks = vi.hoisted(() => ({
  state: {} as ReturnType<typeof useSongWiki>,
  route: { params: { id: "10" } },
  play: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  select: vi.fn(),
  artist: vi.fn(),
  album: vi.fn(),
}));
vi.mock("@/composables/useSongWiki", () => ({ useSongWiki: () => mocks.state }));
vi.mock("@/core/player", () => ({ playNow: mocks.play }));
vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
}));
vi.mock("@/utils/navigate", () => ({
  navigateToArtist: mocks.artist,
  navigateToAlbum: mocks.album,
}));
vi.mock("@/composables/useTrackMenu", () => ({
  useTrackMenu: () => ({ items: computed(() => []), handleSelect: mocks.select }),
}));
vi.mock("@/components/list/SongList.vue", () => ({
  default: { props: ["items"], template: '<div data-testid="songs">{{ items.length }}</div>' },
}));

const track: Track = {
  id: "10",
  source: "netease",
  title: "百科歌曲",
  cover: "https://img/cover",
  artists: [{ id: "1", name: "歌手" }],
  album: { id: "2", name: "专辑" },
  duration: 1000,
};
let wrapper: VueWrapper;

/** 挂载百科页面，保留交互所需的插槽与按钮 */
const start = (): void => {
  wrapper = mount(SongWikiPage, {
    global: {
      plugins: [createI18n({ legacy: false, locale: "zh-CN", messages: { "zh-CN": zhCN } })],
      stubs: {
        SButton: { template: "<button><slot/></button>" },
        SCard: { props: ["title"], template: "<article><h3>{{ title }}</h3><slot/></article>" },
        STag: { template: "<span><slot/></span>" },
        SAlert: { template: '<div role="alert"><slot/></div>' },
        SLoading: true,
        SImg: true,
        SDropdownMenu: { template: '<div><slot name="trigger"/></div>' },
        SDialog: {
          props: ["open"],
          template: '<div v-if="open" data-testid="preview"><slot/></div>',
        },
        IconLucideArrowLeft: true,
        IconLucideUserRound: true,
        IconLucideDisc3: true,
        IconLucideCalendarDays: true,
        IconLucidePlay: true,
        IconLucideEllipsis: true,
      },
    },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.route = reactive({ params: { id: "10" } });
  mocks.state = {
    track: shallowRef(track),
    publishTime: ref(1700000000000),
    wiki: shallowRef<SongWiki>({
      story: {
        musicFirstListenDto: { date: "2024.01.01", season: "冬", meetDurationDesc: "初次相遇" },
        musicTotalPlayDto: { playCount: 8 },
        musicLikeSongDto: { like: true, text: "已收藏" },
      },
      basicInfo: [{ label: "曲风", tags: ["流行"] }],
      awards: [{ title: "奖项", subTitle: "2024" }],
      credentials: [],
      similarIds: [],
    }),
    sheets: ref<WikiSheetState[]>([
      { id: "30", name: "乐谱A", images: [], loading: false, loaded: false, error: false },
    ]),
    similarTracks: shallowRef([track]),
    similarLoading: ref(false),
    loading: ref(false),
    failed: ref(false),
    partialFailure: ref(false),
    load: vi.fn(),
    loadSheet: vi.fn(),
  };
});
afterEach(() => wrapper?.unmount());

describe("百科独立页面", () => {
  it("展示旧版主要信息，播放、歌手、专辑与更多入口可用", async () => {
    start();
    for (const text of [
      "百科歌曲",
      "音乐故事",
      "2024.01.01",
      "累计播放 8 次",
      "已收藏",
      "曲风",
      "流行",
      "相关成就",
      "奖项",
      "乐谱A",
      "相似歌曲",
    ]) {
      expect(wrapper.text()).toContain(text);
    }
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "播放")!
      .trigger("click");
    expect(mocks.play).toHaveBeenCalledExactlyOnceWith(track);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "歌手")!
      .trigger("click");
    expect(mocks.artist).toHaveBeenCalledWith("歌手", { source: "netease", artistId: "1" });
    const artistButton = wrapper.findAll("button").find((button) => button.text() === "歌手")!;
    expect(artistButton.classes()).toEqual(
      expect.arrayContaining(["border-none", "bg-transparent", "focus-visible:underline"]),
    );
    expect(artistButton.attributes("type")).toBe("button");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "专辑")!
      .trigger("click");
    expect(mocks.album).toHaveBeenCalledWith("专辑", { source: "netease", albumId: "2" });
    const albumButton = wrapper.findAll("button").find((button) => button.text() === "专辑")!;
    expect(albumButton.classes()).toEqual(
      expect.arrayContaining(["border-none", "bg-transparent"]),
    );
    expect(wrapper.find(`button[title="${zhCN.songList.context.more}"]`).exists()).toBe(true);
    expect(wrapper.find('[data-testid="songs"]').text()).toBe("1");
  });

  it("加载与失败互斥，失败后可以重试", async () => {
    mocks.state.loading.value = true;
    start();
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("百科歌曲");
    mocks.state.loading.value = false;
    mocks.state.failed.value = true;
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toContain(zhCN.wiki.loadFailed);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "重试")!
      .trigger("click");
    expect(mocks.state.load).toHaveBeenCalledOnce();
  });

  it("展开乐谱才请求预览，失败可重试，点击图片打开预览弹窗", async () => {
    start();
    expect(mocks.state.loadSheet).not.toHaveBeenCalled();
    const details = wrapper.find("details");
    (details.element as HTMLDetailsElement).open = true;
    await details.trigger("toggle");
    expect(mocks.state.loadSheet).toHaveBeenCalledWith("30");
    mocks.state.sheets.value[0].error = true;
    await flushPromises();
    const retry = wrapper.findAll("button").find((button) => button.text() === "重试")!;
    await retry.trigger("click");
    expect(mocks.state.loadSheet).toHaveBeenCalledWith("30");
    mocks.state.sheets.value[0].error = false;
    mocks.state.sheets.value[0].images = ["https://img/page"];
    await flushPromises();
    await wrapper.find('button[title="乐谱预览"]').trigger("click");
    expect(wrapper.find('[data-testid="preview"] img').attributes("src")).toBe("https://img/page");
    mocks.state.track.value = null;
    await flushPromises();
    expect(wrapper.find('[data-testid="preview"]').exists()).toBe(false);
  });

  it("空百科明确显示无更多信息，部分失败不能被伪装成无内容", async () => {
    mocks.state.wiki.value = {
      story: {},
      basicInfo: [],
      awards: [],
      credentials: [],
      similarIds: [],
    };
    mocks.state.sheets.value = [];
    mocks.state.similarTracks.value = [];
    start();
    expect(wrapper.text()).toContain(zhCN.wiki.empty);
    mocks.state.similarLoading.value = true;
    await flushPromises();
    expect(wrapper.text()).not.toContain(zhCN.wiki.empty);
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
    mocks.state.similarLoading.value = false;
    mocks.state.partialFailure.value = true;
    await flushPromises();
    expect(wrapper.text()).toContain(zhCN.wiki.partialFailure);
    expect(wrapper.text()).not.toContain(zhCN.wiki.empty);
    expect(wrapper.text()).toContain("百科歌曲");
  });
});
