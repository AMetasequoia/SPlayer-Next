/**
 * 录入态键序捕获 composable
 *
 * 用法：
 * ```ts
 * const { current, isRecording, start, cancel } = useHotkeyRecorder({
 *   onConfirm: (accel) => { ... },
 * });
 * ```
 *
 * - start()：进入录入态，监听 keydown
 * - 仅 modifier 单按：累积显示，不结束
 * - 非 modifier 键 + modifier：形成完整 binding，调 onConfirm
 * - 失焦：自动取消
 */

import { eventToAccelerator } from "@shared/utils/accelerator";

let activeRecorderCount = 0;

/** 是否正在录入快捷键，录入期间应用内动作须让出按键 */
export const isHotkeyRecording = (): boolean => activeRecorderCount > 0;

interface UseHotkeyRecorderOptions {
  /** 平台（用于显示 + accelerator 反推） */
  isMac: boolean;
  /** 是否需要至少一个 modifier（global 录入设 true，避免单键被全局占用）。可传函数以按当前录入目标动态切换 */
  requireModifier?: boolean | (() => boolean);
  /** 允许将无修饰 Esc 录为绑定，仅用于退出播放界面的应用内快捷键 */
  allowEscape?: () => boolean;
  /** 录入完成回调 */
  onConfirm: (accelerator: string) => void;
  /** 取消回调（Esc / 失焦） */
  onCancel?: () => void;
  /** 清除回调（Backspace） */
  onClear?: () => void;
  /** 录入状态变化 */
  onRecordingChange?: (recording: boolean) => void;
}

/** 录入态当前显示文案（实时反馈用户已按下的 modifier） */
const buildLivePreview = (event: KeyboardEvent, isMac: boolean): string => {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push(isMac ? "⌃" : "Ctrl");
  if (event.metaKey) parts.push(isMac ? "⌘" : "Win");
  if (event.altKey) parts.push(isMac ? "⌥" : "Alt");
  if (event.shiftKey) parts.push(isMac ? "⇧" : "Shift");
  return isMac ? parts.join("") : parts.join(" + ");
};

/**
 * 捕获快捷键录入，离开作用域时释放监听与录入状态
 * @param options - 录入限制和结果回调
 * @returns 录入状态及启动、取消方法
 */
export const useHotkeyRecorder = (options: UseHotkeyRecorderOptions) => {
  const {
    isMac,
    requireModifier = false,
    allowEscape,
    onConfirm,
    onCancel,
    onClear,
    onRecordingChange,
  } = options;

  const isRecording = ref(false);
  const current = ref<string>("");

  /**
   * 捕获录入按键并阻止触发应用动作或浮层退出
   * @param event - 当前键盘事件
   */
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!isRecording.value) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    // Backspace 清除当前 binding
    if (event.code === "Backspace") {
      isRecording.value = false;
      current.value = "";
      cleanup();
      onClear?.();
      return;
    }

    // 退出播放界面可录入 Esc，其他动作仍用 Esc 取消
    if (
      event.code === "Escape" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.shiftKey &&
      !allowEscape?.()
    ) {
      isRecording.value = false;
      current.value = "";
      cleanup();
      onCancel?.();
      return;
    }

    // 实时显示
    current.value = buildLivePreview(event, isMac);

    const accel = eventToAccelerator(event, isMac);
    if (!accel) {
      // 仅按了 modifier，等下一个非 modifier 键
      return;
    }

    // 检查 requireModifier：global 不允许单键
    const needsModifier =
      typeof requireModifier === "function" ? requireModifier() : requireModifier;
    if (needsModifier && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // 只允许带 modifier 的组合；单键拒绝
      return;
    }

    // 完整组合达成
    isRecording.value = false;
    cleanup();
    onConfirm(accel);
  };

  const handleBlur = (): void => {
    if (isRecording.value) cancel();
  };

  /** 释放本次录入的监听和占用状态 */
  const cleanup = (): void => {
    activeRecorderCount--;
    window.removeEventListener("keydown", handleKeyDown, { capture: true });
    window.removeEventListener("blur", handleBlur);
    onRecordingChange?.(false);
  };

  /** 开始录入，防止重复注册监听 */
  const start = (): void => {
    if (isRecording.value) return;
    isRecording.value = true;
    activeRecorderCount++;
    current.value = "";
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("blur", handleBlur);
    onRecordingChange?.(true);
  };

  const cancel = (): void => {
    if (!isRecording.value) return;
    isRecording.value = false;
    current.value = "";
    cleanup();
    onCancel?.();
  };

  onScopeDispose(cancel);

  return {
    isRecording,
    current,
    start,
    cancel,
  };
};
