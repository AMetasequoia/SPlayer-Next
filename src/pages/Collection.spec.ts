import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { Collection } from "@/types/collection";
import CollectionPage from "./Collection.vue";

const mocks = vi.hoisted(() => ({
  route: {
    params: { source: "netease", type: "playlist", id: "10" },
    query: {},
    fullPath: "/collection/netease/playlist/10",
  },
  load: vi.fn(),
  collection: {} as Collection,
}));
vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/services/collection", () => ({ loadCollection: mocks.load }));
vi.mock("@/services/coverTransition", () => ({
  coverTransitionActive: false,
  getCoverPreview: () => undefined,
}));
vi.mock("@/composables/useCopyText", () => ({ useCopyText: () => ({ copy: vi.fn() }) }));
vi.mock("@/composables/collection/useCollectionSubscribe", () => ({
  useCollectionSubscribe: () => ({
    available: ref(false),
    busy: ref(false),
    isSubscribed: ref(false),
  }),
}));
vi.mock("@/composables/collection/usePlaylistManage", () => ({
  usePlaylistManage: () => ({
    canManage: ref(false),
    editOpen: ref(false),
    deleteOpen: ref(false),
    editTitle: ref(""),
    editDescription: ref(""),
    submitting: ref(false),
    deleting: ref(false),
  }),
}));
vi.mock("@/core/player", () => ({ playFrom: vi.fn() }));
vi.mock("@/components/list/SongList.vue", () => ({
  default: { template: '<div data-testid="songs"/>' },
}));
vi.mock("@/components/list/NeteaseComments.vue", () => ({
  default: {
    props: ["target"],
    template: '<div data-testid="comments">{{target.type}}:{{target.id}}</div>',
  },
}));
let wrapper: VueWrapper;
/** 挂载详情页，标签桩保留真实 v-model 切换 */
const start = (): void => {
  wrapper = mount(CollectionPage, {
    global: {
      config: { warnHandler: () => {} },
      stubs: {
        STabs: {
          props: ["tabs", "modelValue"],
          emits: ["update:modelValue"],
          template:
            '<div data-testid="tabs"><button v-for="tab in tabs" :key="tab.key" @click="$emit(\'update:modelValue\',tab.key)">{{tab.key}}</button></div>',
        },
        SButton: { template: "<button><slot/></button>" },
        SDialog: true,
        SInput: true,
        DetailCover: true,
        SDropdownMenu: true,
        STooltip: true,
        SDivider: true,
        SLoading: true,
      },
    },
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.route = {
    params: { source: "netease", type: "playlist", id: "10" },
    query: {},
    fullPath: "/collection/netease/playlist/10",
  };
  mocks.collection = { source: "netease", type: "playlist", id: "10", title: "歌单", tracks: [] };
  mocks.load.mockImplementation(async (_source, _type, _id, options) =>
    options.onUpdate(mocks.collection),
  );
});
afterEach(() => wrapper?.unmount());

describe("网易云专辑和歌单评论标签", () => {
  it.each(["playlist", "album"] as const)(
    "%s 按需挂载评论，不依赖歌曲数量，回到歌曲标签卸载评论",
    async (type) => {
      mocks.route.params.type = type;
      mocks.collection.type = type;
      start();
      await flushPromises();
      expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="comments"]').exists()).toBe(false);
      await wrapper.findAll('[data-testid="tabs"] button')[1].trigger("click");
      await flushPromises();
      expect(wrapper.get('[data-testid="comments"]').text()).toBe(`${type}:10`);
      await wrapper.findAll('[data-testid="tabs"] button')[0].trigger("click");
      await flushPromises();
      expect(wrapper.find('[data-testid="comments"]').exists()).toBe(false);
    },
  );
  it.each(["local", "qqmusic", "kugou", "streaming"])("%s 不显示网易云评论标签", async (source) => {
    mocks.route.params.source = source;
    start();
    await flushPromises();
    expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(false);
  });
  it.each(["cloud", "radio"])("%s 不误用歌单或专辑评论", async (type) => {
    mocks.route.params.type = type;
    start();
    await flushPromises();
    expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(false);
  });
  it("私密歌单不开放评论", async () => {
    mocks.collection.privacy = 10;
    start();
    await flushPromises();
    expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(false);
  });
});
