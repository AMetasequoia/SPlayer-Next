import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import type { useNeteaseComments } from "@/composables/useNeteaseComments";
import zh from "@/i18n/locales/zh-CN.json";
import NeteaseComments from "./NeteaseComments.vue";

const mocks = vi.hoisted(() => ({ state: {} as ReturnType<typeof useNeteaseComments> }));
vi.mock("@/composables/useNeteaseComments", () => ({ useNeteaseComments: () => mocks.state }));
vi.mock("@/components/ui/SVirtualList.vue", () => ({
  default: {
    props: ["items"],
    template:
      '<div><template v-for="item in items" :key="item.key"><slot :item="item"/></template></div>',
  },
}));
let wrapper: VueWrapper;
/** 用展开全部行的虚拟列表桩验证显示与交互 */
const start = (): void => {
  wrapper = mount(NeteaseComments, {
    props: { target: { type: "playlist", id: "10" } },
    global: {
      plugins: [createI18n({ legacy: false, locale: "zh-CN", messages: { "zh-CN": zh } })],
      stubs: {
        SCard: { template: "<article><slot/></article>" },
        SButton: { template: '<button><slot name="icon"/><slot/></button>' },
        SImg: true,
        SLoading: true,
        IconLucideRefreshCw: true,
        IconLucideClock: true,
        IconLucideMapPin: true,
        IconLucideThumbsUp: true,
      },
    },
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  const item = {
    id: "100",
    text: "评论正文",
    userName: "用户",
    liked: true,
    likedCount: 5,
    reply: [{ id: "101", userName: "回复者", text: "引用内容" }],
  };
  mocks.state = {
    hot: shallowRef([item]),
    comments: shallowRef([item]),
    total: ref(55),
    hasMore: ref(true),
    trimmed: ref(false),
    hotLoading: ref(false),
    loading: ref(false),
    hotError: ref(""),
    error: ref(""),
    pendingLikes: shallowRef(new Set<string>()),
    refresh: vi.fn(),
    load: vi.fn(),
    toggleLike: vi.fn(),
  };
});
afterEach(() => wrapper?.unmount());

describe("旧版风格的网易云评论列表", () => {
  it("同时显示热门和全部、引用回复、赞数，不显示来源选择或分页器", async () => {
    start();
    expect(wrapper.text()).toContain("热门评论");
    expect(wrapper.text()).toContain("全部评论");
    expect(wrapper.text()).toContain("55");
    expect(wrapper.text()).toContain("引用内容");
    expect(wrapper.findAll("article")).toHaveLength(2);
    expect(wrapper.find("select").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("下一页");
    const like = wrapper.findAll('button[aria-pressed="true"]')[0];
    await like.trigger("click");
    expect(mocks.state.toggleLike).toHaveBeenCalledWith(mocks.state.hot.value[0]);
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "加载更多")!
      .trigger("click");
    expect(mocks.state.load).toHaveBeenCalledWith("new");
  });
  it("热门局部失败保留全部，重试仅对应分区", async () => {
    mocks.state.hot.value = [];
    mocks.state.hotError.value = "hot offline";
    start();
    expect(wrapper.text()).toContain("评论正文");
    expect(wrapper.get('[role="alert"]').text()).toContain("hot offline");
    await wrapper.get('[role="alert"] button').trigger("click");
    expect(mocks.state.load).toHaveBeenCalledWith("hot");
  });
  it("当前评论的在途状态用于禁止重复写入，刷新/加载更多也不能越过写入", () => {
    mocks.state.pendingLikes.value = new Set(["100"]);
    start();
    expect(wrapper.get('button[title="刷新评论"]').attributes("disabled")).toBeDefined();
    expect(
      wrapper
        .findAll("button")
        .find((b) => b.text() === "加载更多")!
        .attributes("disabled"),
    ).toBeDefined();
  });
  it("首批加载时不提前闪空状态，空热门和无更多均有提示", async () => {
    mocks.state.hot.value = [];
    mocks.state.comments.value = [];
    mocks.state.loading.value = true;
    mocks.state.hotLoading.value = true;
    start();
    expect(wrapper.findAll('[role="status"]')).toHaveLength(2);
    expect(wrapper.text()).not.toContain("暂无评论");
    mocks.state.loading.value = false;
    mocks.state.hotLoading.value = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("暂无热门评论");
    expect(wrapper.text()).toContain("暂无评论");
  });
});
