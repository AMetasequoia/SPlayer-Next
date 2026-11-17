import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, type EffectScope } from "vue";
import type { HotkeyBindingsMap } from "@shared/types/hotkey";
import { defaultHotkeyBindings } from "@shared/defaults/hotkeys";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";
import SDialog from "@/components/ui/SDialog.vue";

const mocks = vi.hoisted(() => ({
  bindings: {} as HotkeyBindingsMap,
  status: { isPlayerExpanded: true },
  expanded: vi.fn(),
  off: vi.fn(),
}));
vi.mock("@/stores/hotkey", () => ({ useHotkeyStore: () => ({ bindings: mocks.bindings }) }));
vi.mock("@/stores/status", () => ({ useStatusStore: () => mocks.status }));
vi.mock("@/utils/config", () => ({ isMac: false }));
vi.mock("@/settings/useSettingsDialog", () => ({ useSettingsDialog: () => ({ show: vi.fn() }) }));
vi.mock("@/core/player", () => ({}));
vi.mock("@/services/playerTransition", () => ({ setPlayerExpanded: mocks.expanded }));

import { installHotkeyManager, uninstallHotkeyManager } from "./manager";
import { isHotkeyRecording, useHotkeyRecorder } from "./recorder";

let scope: EffectScope;
let dialog: VueWrapper | null = null;

/**
 * 发送可取消的 Escape 事件
 * @param options - 修饰键或重复状态
 * @returns 实际分派的键盘事件
 */
const escape = (options: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    bubbles: true,
    cancelable: true,
    ...options,
  });
  window.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  mocks.bindings = reactive(structuredClone(defaultHotkeyBindings));
  mocks.status.isPlayerExpanded = true;
  mocks.expanded.mockImplementation((expanded: boolean) => {
    mocks.status.isPlayerExpanded = expanded;
  });
  vi.stubGlobal("api", { hotkey: { onTrigger: () => mocks.off } });
  document.body.innerHTML = "";
  scope = effectScope();
  installHotkeyManager();
});

afterEach(() => {
  dialog?.unmount();
  dialog = null;
  scope.stop();
  expect(isHotkeyRecording()).toBe(false);
  uninstallHotkeyManager();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("Esc 退出播放界面", () => {
  it("无浮层时退出，收起后不再消费 Esc，也不响应长按", () => {
    expect(escape({ repeat: true }).defaultPrevented).toBe(true);
    expect(mocks.expanded).not.toHaveBeenCalled();
    expect(escape().defaultPrevented).toBe(true);
    expect(mocks.expanded).toHaveBeenCalledExactlyOnceWith(false);
    expect(escape().defaultPrevented).toBe(false);
  });

  it("弹窗或菜单先关闭，再次 Esc 才退出播放界面", () => {
    const layer = document.createElement("div");
    layer.setAttribute("data-dismissable-layer", "");
    layer.setAttribute("data-state", "open");
    document.body.append(layer);
    const dismiss = vi.fn(() => layer.remove());
    window.addEventListener("keydown", dismiss, { once: true });
    expect(escape().defaultPrevented).toBe(false);
    expect(dismiss).toHaveBeenCalledOnce();
    expect(mocks.expanded).not.toHaveBeenCalled();
    escape();
    expect(mocks.expanded).toHaveBeenCalledWith(false);
  });

  it("真实 SDialog 与 Reka 事件链先关闭弹窗，再允许退出播放界面", async () => {
    dialog = mount(SDialog, {
      props: { open: true, title: "测试", closable: false },
      attachTo: document.body,
      global: {
        components: {
          DialogRoot,
          DialogPortal,
          DialogOverlay,
          DialogContent,
          DialogTrigger,
          DialogTitle,
          DialogDescription,
          DialogClose,
        },
        stubs: { SButton: true, IconLucideX: true },
      },
    });
    await flushPromises();
    expect(document.querySelector('[data-dismissable-layer][data-state="open"]')).not.toBeNull();
    escape();
    await flushPromises();
    expect(dialog.emitted("update:open")).toEqual([[false]]);
    expect(mocks.expanded).not.toHaveBeenCalled();
    escape();
    expect(mocks.expanded).toHaveBeenCalledWith(false);
  });

  it("关闭动画中的浮层不阻挡退出", () => {
    document.body.innerHTML = '<div data-dismissable-layer data-state="closed"></div>';
    escape();
    expect(mocks.expanded).toHaveBeenCalledWith(false);
  });

  it.each(["input", "textarea", "select"])("不打断 %s 输入", (tag) => {
    const input = document.createElement(tag);
    document.body.append(input);
    input.focus();
    escape();
    expect(mocks.expanded).not.toHaveBeenCalled();
  });

  it("已消费或输入法组合中的按键不会退出", () => {
    const event = new KeyboardEvent("keydown", { code: "Escape", cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
    escape({ isComposing: true });
    expect(mocks.expanded).not.toHaveBeenCalled();
  });

  it("实时遵循自定义绑定和取消绑定，不硬编码 Esc", async () => {
    mocks.bindings["view.closePlayer"].inApp = "Shift+Escape";
    await nextTick();
    escape();
    expect(mocks.expanded).not.toHaveBeenCalled();
    escape({ shiftKey: true });
    expect(mocks.expanded).toHaveBeenCalledOnce();
    mocks.expanded.mockClear();
    mocks.status.isPlayerExpanded = true;
    mocks.bindings["view.closePlayer"].inApp = null;
    await nextTick();
    escape();
    escape({ shiftKey: true });
    expect(mocks.expanded).not.toHaveBeenCalled();
  });

  it("录入退出键时可保存 Esc，不先触发退出动作", () => {
    const confirm = vi.fn();
    const recorder = scope.run(() =>
      useHotkeyRecorder({ isMac: false, allowEscape: () => true, onConfirm: confirm }),
    )!;
    recorder.start();
    expect(isHotkeyRecording()).toBe(true);
    escape();
    expect(confirm).toHaveBeenCalledExactlyOnceWith("Escape");
    expect(mocks.expanded).not.toHaveBeenCalled();
    expect(isHotkeyRecording()).toBe(false);
  });

  it("其他动作仍用 Esc 取消录入，卸载和失焦均释放监听", () => {
    const cancel = vi.fn();
    const confirm = vi.fn();
    const recorder = scope.run(() =>
      useHotkeyRecorder({ isMac: false, onConfirm: confirm, onCancel: cancel }),
    )!;
    recorder.start();
    escape();
    expect(cancel).toHaveBeenCalledOnce();
    expect(confirm).not.toHaveBeenCalled();
    recorder.start();
    window.dispatchEvent(new Event("blur"));
    expect(cancel).toHaveBeenCalledTimes(2);
    recorder.start();
    scope.stop();
    expect(isHotkeyRecording()).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(3);
    expect(mocks.expanded).not.toHaveBeenCalled();
    escape();
    expect(mocks.expanded).toHaveBeenCalledWith(false);
  });

  it("录入时保留组合 Esc 和 Backspace 清除行为", () => {
    const confirm = vi.fn();
    const clear = vi.fn();
    const recorder = scope.run(() =>
      useHotkeyRecorder({ isMac: false, onConfirm: confirm, onClear: clear }),
    )!;
    recorder.start();
    escape({ ctrlKey: true });
    expect(confirm).toHaveBeenCalledExactlyOnceWith("CommandOrControl+Escape");
    recorder.start();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Backspace", cancelable: true }));
    expect(clear).toHaveBeenCalledOnce();
    expect(isHotkeyRecording()).toBe(false);
  });

  it("全局录入仍拒绝裸键，重复安装与卸载不会积累监听", () => {
    const confirm = vi.fn();
    const recorder = scope.run(() =>
      useHotkeyRecorder({
        isMac: false,
        requireModifier: true,
        allowEscape: () => true,
        onConfirm: confirm,
      }),
    )!;
    recorder.start();
    escape();
    expect(confirm).not.toHaveBeenCalled();
    expect(isHotkeyRecording()).toBe(true);
    recorder.cancel();
    installHotkeyManager();
    uninstallHotkeyManager();
    expect(mocks.off).toHaveBeenCalledOnce();
    escape();
    expect(mocks.expanded).not.toHaveBeenCalled();
  });
});
