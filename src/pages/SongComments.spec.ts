import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { Track } from "@shared/types/player";
import SongComments from "./SongComments.vue";

const mocks = vi.hoisted(() => ({
  route: { params: { id: "10" } },
  detail: vi.fn(),
  play: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ back: mocks.back, replace: mocks.replace }),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/apis/song/netease", () => ({ songsByIds: mocks.detail }));
vi.mock("@/core/player", () => ({ playNow: mocks.play }));
vi.mock("@/components/list/NeteaseComments.vue", () => ({
  default: {
    props: ["target"],
    template: '<div data-testid="comments">{{target.type}}:{{target.id}}</div>',
  },
}));
const song: Track = {
  id: "10",
  title: "评论目标",
  artists: [{ name: "歌手" }],
  duration: 1000,
  source: "netease",
};
let wrapper: VueWrapper;
/** 挂载独立评论页，保留按钮点击 */
const start = (): void => {
  wrapper = mount(SongComments, {
    global: {
      stubs: {
        SButton: { template: "<button><slot/></button>" },
        SImg: true,
        SLoading: true,
        IconLucideArrowLeft: true,
        IconLucidePlay: true,
      },
    },
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.route = reactive({ params: { id: "10" } });
  mocks.detail.mockResolvedValue([song]);
});
afterEach(() => wrapper?.unmount());

describe("网易云歌曲独立评论页", () => {
  it("展示固定目标的封面、歌名和歌手，可播放，评论目标来自路由", async () => {
    start();
    await flushPromises();
    expect(wrapper.text()).toContain("评论目标");
    expect(wrapper.text()).toContain("歌手");
    expect(wrapper.get('[data-testid="comments"]').text()).toBe("song:10");
    await wrapper.get('button[title="wiki.play"]').trigger("click");
    expect(mocks.play).toHaveBeenCalledExactlyOnceWith(song);
  });
  it.each(["0", "-1", "bad", ""])("非法 ID %s 不请求详情或评论", async (id) => {
    mocks.route.params.id = id;
    start();
    await flushPromises();
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="comments"]').exists()).toBe(false);
  });
  it("详情失败可重试，不把不存在的歌曲显示为当前播放歌曲", async () => {
    mocks.detail.mockRejectedValueOnce(new Error("offline"));
    start();
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    await wrapper.get('[role="alert"] button').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("评论目标");
  });
  it("快速切换路由后旧详情不能覆盖新目标", async () => {
    let finish!: (tracks: Track[]) => void;
    mocks.detail.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    start();
    mocks.detail.mockResolvedValue([{ ...song, id: "20", title: "新歌曲" }]);
    mocks.route.params.id = "20";
    await flushPromises();
    finish([song]);
    await flushPromises();
    expect(wrapper.text()).toContain("新歌曲");
    expect(wrapper.text()).not.toContain("评论目标");
    expect(wrapper.get('[data-testid="comments"]').text()).toBe("song:20");
  });
});
