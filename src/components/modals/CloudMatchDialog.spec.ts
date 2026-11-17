import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { reactive } from "vue";
import type { Track } from "@shared/types/player";
import zhCN from "@/i18n/locales/zh-CN.json";
import SInput from "@/components/ui/SInput.vue";
import CloudMatchDialog from "./CloudMatchDialog.vue";

const mocks = vi.hoisted(() => ({
  songsByIds: vi.fn(),
  user: {
    profile: { userId: 1 } as { userId: number } | null,
    isLoggedIn: true,
    matchCloudTrack: vi.fn(),
  },
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock("@/apis/song/netease", () => ({ songsByIds: mocks.songsByIds }));
vi.mock("@/stores/user", () => ({ useUserStore: () => mocks.user }));
vi.mock("@/composables/useToast", () => ({ toast: mocks.toast }));

const original: Track = {
  id: "10",
  cloudId: "1000",
  source: "netease",
  cloud: true,
  title: "识别错误的歌曲",
  artists: [],
  duration: 1000,
};
const target: Track = {
  id: "20",
  source: "netease",
  title: "目标歌曲",
  artists: [{ name: "目标歌手" }],
  album: { name: "目标专辑" },
  duration: 1000,
};
const text = zhCN.cloud.match;
let wrapper: VueWrapper;

/** 挂载带真实输入组件的纠正弹窗 */
const mountDialog = (): VueWrapper => {
  wrapper = mount(CloudMatchDialog, {
    props: { open: true, track: original },
    global: {
      plugins: [createI18n({ legacy: false, locale: "zh-CN", messages: { "zh-CN": zhCN } })],
      components: { SInput },
      stubs: {
        SDialog: {
          props: ["open"],
          emits: ["update:open"],
          template:
            '<div v-if="open"><slot/><slot name="footer" :close="() => $emit(\'update:open\', false)"/></div>',
        },
        SButton: {
          props: ["disabled", "loading"],
          template: '<button :disabled="disabled || loading"><slot/></button>',
        },
        SAlert: { template: "<div><slot/></div>" },
        SImg: true,
        IconLucideX: true,
      },
    },
  });
  return wrapper;
};

/**
 * 按显示文案查找弹窗按钮
 * @param label - 按钮文案
 * @returns 对应的按钮包装器
 */
const button = (label: string) => wrapper.findAll("button").find((item) => item.text() === label)!;

/** 输入目标 ID 并等待验证结束 */
const verifyTarget = async (): Promise<void> => {
  await wrapper.findAll("input")[1].setValue("20");
  await button(text.verify).trigger("click");
  await flushPromises();
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user = reactive({
    ...mocks.user,
    profile: { userId: 1 },
    isLoggedIn: true,
  });
  mocks.user.matchCloudTrack.mockResolvedValue(true);
  mocks.songsByIds.mockResolvedValue([target]);
});

afterEach(() => wrapper?.unmount());

describe("云盘纠正弹窗", () => {
  it("输入本身不写入账号，验证预览后显式确认才提交原云盘 ID", async () => {
    mountDialog();
    expect(button(text.confirm).attributes("disabled")).toBeDefined();
    expect(wrapper.findAll("input")[0].element.value).toBe("1000");

    await verifyTarget();

    expect(mocks.songsByIds).toHaveBeenCalledWith(["20"]);
    expect(wrapper.text()).toContain("目标歌曲");
    expect(wrapper.text()).toContain("目标歌手");
    expect(wrapper.text()).toContain("目标专辑");
    expect(button(text.confirm).attributes("disabled")).toBeUndefined();
    expect(mocks.user.matchCloudTrack).not.toHaveBeenCalled();
    await button(text.confirm).trigger("click");
    await flushPromises();

    expect(mocks.user.matchCloudTrack).toHaveBeenCalledExactlyOnceWith("1000", "20");
    expect(mocks.toast.success).toHaveBeenCalledWith(text.success);
    expect(wrapper.emitted("update:open")).toEqual([[false]]);
  });

  it.each(["", "0", "-1", "1.5", "abc", "10"])("非法或相同 ID %s 不发请求", async (id) => {
    mountDialog();
    await wrapper.findAll("input")[1].setValue(id);
    await wrapper.findAll("input")[1].trigger("keydown", { key: "Enter" });
    await flushPromises();

    expect(mocks.songsByIds).not.toHaveBeenCalled();
    expect(mocks.user.matchCloudTrack).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').text()).toBe(id === "10" ? text.sameId : text.invalidId);
  });

  it("更改输入立即使旧验证失效，不能提交旧预览", async () => {
    mountDialog();
    await verifyTarget();
    await wrapper.findAll("input")[1].setValue("30");

    expect(wrapper.text()).not.toContain("目标歌曲");
    expect(button(text.confirm).attributes("disabled")).toBeDefined();
    expect(mocks.user.matchCloudTrack).not.toHaveBeenCalled();
  });

  it("迟到的旧验证不能覆盖新输入的预览", async () => {
    let finish!: (tracks: Track[]) => void;
    mocks.songsByIds.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    mocks.songsByIds.mockResolvedValueOnce([{ ...target, id: "30", title: "新目标歌曲" }]);
    mountDialog();
    await wrapper.findAll("input")[1].setValue("20");
    await button(text.verify).trigger("click");
    await wrapper.findAll("input")[1].setValue("30");
    await button(text.verify).trigger("click");
    await flushPromises();
    finish([target]);
    await flushPromises();

    expect(wrapper.text()).toContain("新目标歌曲");
    await button(text.confirm).trigger("click");
    await flushPromises();
    expect(mocks.user.matchCloudTrack).toHaveBeenCalledExactlyOnceWith("1000", "30");
  });

  it("未找到歌曲时不可确认", async () => {
    mocks.songsByIds.mockResolvedValue([]);
    mountDialog();
    await verifyTarget();

    expect(wrapper.find('[role="alert"]').text()).toBe(text.notFound);
    expect(button(text.confirm).attributes("disabled")).toBeDefined();
  });

  it("验证失败显示错误，不能提交", async () => {
    mocks.songsByIds.mockRejectedValue(new Error("验证网络错误"));
    mountDialog();
    await verifyTarget();

    expect(wrapper.find('[role="alert"]').text()).toBe("验证网络错误");
    expect(button(text.confirm).attributes("disabled")).toBeDefined();
  });

  it("提交期间禁止重复确认，不提前报告成功", async () => {
    let finish!: (refreshed: boolean) => void;
    mocks.user.matchCloudTrack.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    mountDialog();
    await verifyTarget();
    await button(text.confirm).trigger("click");
    await button(text.confirm).trigger("click");

    expect(mocks.user.matchCloudTrack).toHaveBeenCalledTimes(1);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(button(text.confirm).attributes("disabled")).toBeDefined();
    finish(true);
    await flushPromises();
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
  });

  it("纠正成功但刷新未完成时明确提示，不误报写入失败", async () => {
    mocks.user.matchCloudTrack.mockResolvedValue(false);
    mountDialog();
    await verifyTarget();
    await button(text.confirm).trigger("click");
    await flushPromises();

    expect(mocks.toast.warning).toHaveBeenCalledWith(text.refreshFailed);
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:open")).toEqual([[false]]);
  });

  it("纠正失败保留弹窗和验证结果，允许重试", async () => {
    mocks.user.matchCloudTrack.mockRejectedValueOnce(new Error("纠正被拒绝"));
    mountDialog();
    await verifyTarget();
    await button(text.confirm).trigger("click");
    await flushPromises();

    expect(mocks.toast.error).toHaveBeenCalledWith("纠正被拒绝");
    expect(wrapper.emitted("update:open")).toBeUndefined();
    expect(button(text.confirm).attributes("disabled")).toBeUndefined();
    await button(text.confirm).trigger("click");
    await flushPromises();
    expect(mocks.toast.success).toHaveBeenCalledWith(text.success);
  });

  it("旧缓存没有独立云盘 ID 时使用原歌曲 ID", async () => {
    mountDialog();
    await wrapper.setProps({ track: { ...original, cloudId: undefined } });
    await verifyTarget();
    await button(text.confirm).trigger("click");
    await flushPromises();

    expect(mocks.user.matchCloudTrack).toHaveBeenCalledWith("10", "20");
  });

  it("账号切换时关闭且禁止提交旧账号条目", async () => {
    mountDialog();
    await verifyTarget();
    mocks.user.profile = { userId: 2 };
    await flushPromises();

    expect(wrapper.emitted("update:open")).toEqual([[false]]);
    expect(button(text.confirm).attributes("disabled")).toBeDefined();
    expect(mocks.user.matchCloudTrack).not.toHaveBeenCalled();
  });

  it("关闭后的提交结果不再弹出成功提示或重复关闭", async () => {
    let finish!: (refreshed: boolean) => void;
    mocks.user.matchCloudTrack.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    mountDialog();
    await verifyTarget();
    await button(text.confirm).trigger("click");
    wrapper.unmount();
    finish(true);
    await flushPromises();

    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:open")).toBeUndefined();
  });
});
