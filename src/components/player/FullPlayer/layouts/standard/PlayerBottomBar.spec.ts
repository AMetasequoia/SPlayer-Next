import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { Track } from "@shared/types/player";
import PlayerBottomBar from "./PlayerBottomBar.vue";

const mocks = vi.hoisted(() => ({
  media: {} as { track: Track | null },
  status: {} as { currentTrack: Track | null },
  push: vi.fn(),
  expanded: vi.fn(),
}));
vi.mock("@/stores/status", () => ({ useStatusStore: () => mocks.status }));
vi.mock("@/stores/media", () => ({ useMediaStore: () => mocks.media }));
vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({ system: { download: { enabled: false } } }),
}));
vi.mock("@/composables/useFavorite", () => ({
  useFavorite: () => ({ isSupported: () => true, isLiked: () => false }),
}));
vi.mock("@/composables/useDownload", () => ({
  useDownload: () => ({ enqueue: vi.fn() }),
  buildDownloadQualityItems: () => [],
}));
vi.mock("@/composables/usePlaylistPicker", () => ({
  usePlaylistPicker: () => ({
    open: ref(false),
    tracks: ref([]),
    mode: ref("add"),
    openPicker: vi.fn(),
  }),
}));
vi.mock("@/composables/useTimeFormat", () => ({
  useTimeFormat: () => ({ timeDisplay: ref("0:00"), toggleTimeFormat: vi.fn() }),
}));
vi.mock("@/composables/useProgressLyric", () => ({
  useProgressLyric: () => ({ snapToNearestLyric: (value: number) => value }),
}));
vi.mock("@/services/playerTransition", () => ({ setPlayerExpanded: mocks.expanded }));
vi.mock("@/components/player/FullPlayer/context", () => ({
  useFullPlayer: () => ({ immersive: ref(false), onBarEnter: vi.fn(), onBarLeave: vi.fn() }),
}));
vi.mock("@/core/player", () => ({}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const song: Track = {
  id: "10",
  cloudId: "100",
  title: "歌曲",
  artists: [],
  duration: 1000,
  source: "netease",
};
let wrapper: VueWrapper;
/** 保留评论按钮和真实入口事件，其他播放控件使用桩 */
const start = (): void => {
  wrapper = mount(PlayerBottomBar, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        SButton: { template: '<button><slot name="icon"/><slot/></button>' },
        SSlider: true,
        SPopover: true,
        SDropdownMenu: true,
        PlaylistPicker: true,
      },
    },
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.media = reactive({ track: song as Track | null });
  mocks.status = reactive({ currentTrack: null as Track | null });
});
afterEach(() => wrapper?.unmount());

describe("播放器中的网易云评论入口", () => {
  it("网易云歌曲打开独立页并收起播放界面", async () => {
    start();
    await wrapper.get('button[title="comments.name"]').trigger("click");
    await flushPromises();
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({
      name: "song-comments",
      params: { id: "10" },
    });
    expect(mocks.expanded).toHaveBeenCalledWith(false);
  });
  it.each(["qqmusic", "kugou", "local", "plugin", "streaming"] as const)(
    "%s 不显示评论入口",
    (source) => {
      mocks.media.track = { ...song, source };
      start();
      expect(wrapper.find('button[title="comments.name"]').exists()).toBe(false);
    },
  );
  it("无曲目或无效 ID 不提供评论，加载中使用有效网易云队列项", async () => {
    mocks.media.track = null;
    start();
    expect(wrapper.find('button[title="comments.name"]').exists()).toBe(false);
    mocks.status.currentTrack = { ...song, id: "0" };
    await wrapper.vm.$nextTick();
    expect(wrapper.find('button[title="comments.name"]').exists()).toBe(false);
    mocks.status.currentTrack = song;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('button[title="comments.name"]').exists()).toBe(true);
  });
});
