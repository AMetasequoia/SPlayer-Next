import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSystemConfig } from "@shared/defaults/settings";
import type { DynamicIslandSettings } from "@shared/types/settings";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  config: {} as DynamicIslandSettings,
  saved: { mode: "snapped", x: null as number | null, y: null as number | null, visible: false },
  set: vi.fn(),
  broadcast: vi.fn(),
  tray: vi.fn(),
  cursor: vi.fn(() => ({ x: 500, y: 500 })),
  reducedMotion: true,
  richAnimation: true,
  isWin: true,
  animation: vi.fn(),
}));
vi.mock("electron", () => {
  const display = {
    scaleFactor: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  };
  return {
    systemPreferences: { getAnimationSettings: mocks.animation },
    screen: {
      getPrimaryDisplay: () => display,
      getDisplayNearestPoint: () => display,
      getCursorScreenPoint: mocks.cursor,
    },
  };
});
vi.mock("@electron-toolkit/utils", () => ({ is: { dev: false } }));
vi.mock("./create", () => ({ createWindow: mocks.create }));
vi.mock("@main/store", () => ({
  store: {
    get: (key: string) => (key === "dynamicIsland" ? mocks.config : mocks.saved),
    set: mocks.set,
  },
}));
vi.mock("@main/utils/broadcast", () => ({ broadcast: mocks.broadcast }));
vi.mock("@main/utils/config", () => ({
  isMac: false,
  get isWin() {
    return mocks.isWin;
  },
}));
vi.mock("@main/services/tray", () => ({ setTrayDynamicIsland: mocks.tray }));
vi.mock("@main/utils/lifecycle", () => ({ isAppQuitting: () => false }));

import {
  applyDynamicIslandNonOcclusive,
  applyDynamicIslandPlaybackVisibility,
  closeDynamicIslandWindow,
  createDynamicIslandWindow,
  getDynamicIslandWindow,
  syncDynamicIslandPlaybackState,
  toggleDynamicIslandWindow,
} from "./dynamicIsland";

let visible = false;
let destroyed = false;
let opacity = 1;
let win: EventEmitter & {
  showInactive: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  setOpacity: ReturnType<typeof vi.fn>;
  webContents: EventEmitter & { send: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.config = structuredClone(defaultSystemConfig.dynamicIsland);
  mocks.reducedMotion = true;
  mocks.richAnimation = true;
  mocks.isWin = true;
  mocks.animation.mockImplementation(() => ({
    prefersReducedMotion: mocks.reducedMotion,
    shouldRenderRichAnimation: mocks.richAnimation,
  }));
  mocks.saved = { mode: "snapped", x: null, y: null, visible: false };
  visible = false;
  destroyed = false;
  opacity = 1;
  const webContents = Object.assign(new EventEmitter(), { send: vi.fn(), setZoomFactor: vi.fn() });
  win = Object.assign(new EventEmitter(), {
    isVisible: () => visible,
    isDestroyed: () => destroyed,
    showInactive: vi.fn(() => {
      visible = true;
    }),
    hide: vi.fn(() => {
      visible = false;
    }),
    focus: vi.fn(),
    getOpacity: () => opacity,
    setOpacity: vi.fn((value: number) => {
      opacity = value;
    }),
    close: vi.fn(() => {
      destroyed = true;
      win.emit("closed");
    }),
    loadFile: vi.fn(),
    loadURL: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    getBounds: () => ({ x: 100, y: 0, width: 200, height: 40 }),
    webContents,
  });
  mocks.create.mockReturnValue(win);
  syncDynamicIslandPlaybackState("idle");
});

afterEach(() => {
  closeDynamicIslandWindow();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe("灵动岛暂停隐藏", () => {
  it("默认开启，启动和 ready 前不闪现；临时隐藏保留用户启用状态", () => {
    expect(mocks.config.hideWhenPaused).toBe(true);
    createDynamicIslandWindow();
    syncDynamicIslandPlaybackState("playing");
    expect(win.showInactive).not.toHaveBeenCalled();
    syncDynamicIslandPlaybackState("paused");
    win.emit("ready-to-show");
    expect(visible).toBe(false);
    expect(mocks.set).toHaveBeenCalledWith("windowStates.dynamicIsland.visible", true);
    expect(mocks.set).not.toHaveBeenCalledWith("windowStates.dynamicIsland.visible", false);
    expect(mocks.broadcast).not.toHaveBeenCalledWith("dynamicIsland:visibilityChange", false);
    expect(mocks.tray).not.toHaveBeenCalledWith(false);
  });

  it("播放恢复不抢焦点，重复事件不重复显示，停止后隐藏", () => {
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    syncDynamicIslandPlaybackState("playing");
    syncDynamicIslandPlaybackState("playing");
    expect(win.showInactive).toHaveBeenCalledOnce();
    expect(win.focus).not.toHaveBeenCalled();
    syncDynamicIslandPlaybackState("paused");
    expect(win.hide).toHaveBeenCalledOnce();
    syncDynamicIslandPlaybackState("playing");
    expect(win.showInactive).toHaveBeenCalledTimes(2);
    syncDynamicIslandPlaybackState("stopped");
    expect(win.hide).toHaveBeenCalledTimes(2);
  });

  it("加载时保持原可见性，配置开关即时生效", () => {
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    syncDynamicIslandPlaybackState("loading");
    expect(visible).toBe(false);
    syncDynamicIslandPlaybackState("playing");
    syncDynamicIslandPlaybackState("loading");
    expect(visible).toBe(true);
    syncDynamicIslandPlaybackState("paused");
    mocks.config.hideWhenPaused = false;
    applyDynamicIslandPlaybackVisibility();
    expect(visible).toBe(true);
    mocks.config.hideWhenPaused = true;
    applyDynamicIslandPlaybackVisibility();
    expect(visible).toBe(false);
  });

  it.each(["曲尾", "手动切歌"])("%s 后停止和慢速加载期间保持可见，不靠计时器延迟隐藏", () => {
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    syncDynamicIslandPlaybackState("playing");
    syncDynamicIslandPlaybackState("stopped", true);
    syncDynamicIslandPlaybackState("stopped");
    vi.advanceTimersByTime(30_000);
    expect(visible).toBe(true);
    expect(win.hide).not.toHaveBeenCalled();
    syncDynamicIslandPlaybackState("loading");
    syncDynamicIslandPlaybackState("playing");
    expect(win.showInactive).toHaveBeenCalledOnce();
    expect(win.focus).not.toHaveBeenCalled();
    syncDynamicIslandPlaybackState("stopped");
    expect(visible).toBe(false);
  });

  it.each(["paused", "idle"] as const)("切歌等待时 %s 立即隐藏并清除保留状态", (state) => {
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    syncDynamicIslandPlaybackState("playing");
    syncDynamicIslandPlaybackState("stopped", true);
    syncDynamicIslandPlaybackState(state);
    syncDynamicIslandPlaybackState("stopped");
    expect(visible).toBe(false);
    expect(win.hide).toHaveBeenCalledOnce();
  });

  it("真正停止及加载失败立即隐藏，暂停时切歌不唤醒窗口", () => {
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    syncDynamicIslandPlaybackState("playing");
    syncDynamicIslandPlaybackState("stopped", true);
    syncDynamicIslandPlaybackState("stopped", false);
    expect(visible).toBe(false);
    syncDynamicIslandPlaybackState("stopped", true);
    syncDynamicIslandPlaybackState("loading");
    expect(visible).toBe(false);
    syncDynamicIslandPlaybackState("playing");
    expect(visible).toBe(true);
    syncDynamicIslandPlaybackState("paused");
    syncDynamicIslandPlaybackState("stopped", true);
    syncDynamicIslandPlaybackState("loading");
    expect(visible).toBe(false);
  });

  it("窗口启用前也保存最新状态，手动关闭后不会自动重开", () => {
    syncDynamicIslandPlaybackState("playing");
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    expect(visible).toBe(true);
    syncDynamicIslandPlaybackState("paused");
    expect(toggleDynamicIslandWindow()).toBe(false);
    expect(getDynamicIslandWindow()).toBeNull();
    syncDynamicIslandPlaybackState("playing");
    expect(getDynamicIslandWindow()).toBeNull();
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith("windowStates.dynamicIsland.visible", false);
  });

  it("隐藏和关闭时停止光标轮询，恢复后只启动一个计时器", () => {
    mocks.config.nonOcclusive = true;
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    applyDynamicIslandNonOcclusive(true);
    expect(vi.getTimerCount()).toBe(0);
    syncDynamicIslandPlaybackState("playing");
    expect(vi.getTimerCount()).toBe(1);
    syncDynamicIslandPlaybackState("playing");
    expect(vi.getTimerCount()).toBe(1);
    syncDynamicIslandPlaybackState("paused");
    expect(vi.getTimerCount()).toBe(0);
    const calls = win.webContents.send.mock.calls.length;
    vi.advanceTimersByTime(1000);
    expect(win.webContents.send).toHaveBeenCalledTimes(calls);
    syncDynamicIslandPlaybackState("playing");
    expect(vi.getTimerCount()).toBe(1);
    closeDynamicIslandWindow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("已有窗口重复启用仍遵守暂停状态", () => {
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    expect(createDynamicIslandWindow()).toBe(win);
    expect(win.showInactive).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledOnce();
  });
});

/** 创建已完成淡入的播放窗口 */
const showPlayingWindow = (): void => {
  createDynamicIslandWindow();
  win.emit("ready-to-show");
  syncDynamicIslandPlaybackState("playing");
  vi.advanceTimersByTime(240);
  expect(visible).toBe(true);
  expect(opacity).toBe(1);
};

describe("灵动岛播放显隐缓动", () => {
  beforeEach(() => {
    mocks.reducedMotion = false;
  });

  it("先透明显示再淡入，暂停完成淡出后才真正隐藏，不抢焦点", () => {
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    syncDynamicIslandPlaybackState("playing");
    expect(visible).toBe(true);
    expect(opacity).toBe(0);
    expect(win.setOpacity.mock.invocationCallOrder.at(-1)).toBeLessThan(
      win.showInactive.mock.invocationCallOrder[0]!,
    );
    vi.advanceTimersByTime(80);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    vi.advanceTimersByTime(160);
    expect(opacity).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    syncDynamicIslandPlaybackState("paused");
    expect(visible).toBe(true);
    vi.advanceTimersByTime(80);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    vi.advanceTimersByTime(100);
    expect(visible).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(win.focus).not.toHaveBeenCalled();
    expect(mocks.tray).not.toHaveBeenCalledWith(false);
    expect(mocks.set).not.toHaveBeenCalledWith("windowStates.dynamicIsland.visible", false);
  });

  it("淡出途中恢复，从当前透明度接续，旧动画不会稍后隐藏窗口", () => {
    showPlayingWindow();
    syncDynamicIslandPlaybackState("paused");
    vi.advanceTimersByTime(64);
    const middle = opacity;
    syncDynamicIslandPlaybackState("playing");
    expect(opacity).toBe(middle);
    vi.advanceTimersByTime(240);
    expect(visible).toBe(true);
    expect(opacity).toBe(1);
    expect(win.hide).not.toHaveBeenCalled();
    expect(win.showInactive).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("淡入途中暂停，也从当前透明度回退，下一次播放从透明开始", () => {
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    syncDynamicIslandPlaybackState("playing");
    vi.advanceTimersByTime(32);
    const middle = opacity;
    syncDynamicIslandPlaybackState("paused");
    expect(opacity).toBe(middle);
    vi.advanceTimersByTime(200);
    expect(visible).toBe(false);
    syncDynamicIslandPlaybackState("playing");
    expect(opacity).toBe(0);
    vi.advanceTimersByTime(240);
    expect(opacity).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("重复状态不延长动画，切歌事件不会打断淡入或产生隐藏", () => {
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    syncDynamicIslandPlaybackState("playing");
    for (let i = 0; i < 15; i++) {
      vi.advanceTimersByTime(16);
      syncDynamicIslandPlaybackState("playing");
    }
    expect(vi.getTimerCount()).toBe(0);
    expect(opacity).toBe(1);
    syncDynamicIslandPlaybackState("stopped", true);
    syncDynamicIslandPlaybackState("stopped");
    syncDynamicIslandPlaybackState("loading");
    vi.advanceTimersByTime(30_000);
    expect(visible).toBe(true);
    expect(win.hide).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("暂停后进入加载仍完成隐藏，不因窗口尚未完成淡出而误判为应显示", () => {
    showPlayingWindow();
    syncDynamicIslandPlaybackState("paused");
    vi.advanceTimersByTime(32);
    syncDynamicIslandPlaybackState("stopped", true);
    syncDynamicIslandPlaybackState("loading");
    vi.advanceTimersByTime(240);
    expect(visible).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("关闭暂停隐藏设置可反转在途淡出，重新开启则正常隐藏", () => {
    showPlayingWindow();
    syncDynamicIslandPlaybackState("paused");
    vi.advanceTimersByTime(48);
    const middle = opacity;
    mocks.config.hideWhenPaused = false;
    applyDynamicIslandPlaybackVisibility();
    expect(opacity).toBe(middle);
    vi.advanceTimersByTime(240);
    expect(visible).toBe(true);
    expect(opacity).toBe(1);
    mocks.config.hideWhenPaused = true;
    applyDynamicIslandPlaybackVisibility();
    vi.advanceTimersByTime(180);
    expect(visible).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["淡入", "淡出"])("%s 时手动关闭取消动画，不访问已销毁窗口或自动重建", (phase) => {
    if (phase === "淡出") {
      showPlayingWindow();
      syncDynamicIslandPlaybackState("paused");
    } else {
      createDynamicIslandWindow();
      win.emit("ready-to-show");
      syncDynamicIslandPlaybackState("playing");
    }
    vi.advanceTimersByTime(32);
    closeDynamicIslandWindow();
    const calls = win.setOpacity.mock.calls.length;
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    syncDynamicIslandPlaybackState("playing");
    expect(win.setOpacity).toHaveBeenCalledTimes(calls);
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("开启非遮挡模式后，淡出开始就停止轮询，重复开启也不重启", () => {
    mocks.config.nonOcclusive = true;
    showPlayingWindow();
    expect(vi.getTimerCount()).toBe(1);
    syncDynamicIslandPlaybackState("paused");
    expect(vi.getTimerCount()).toBe(1);
    applyDynamicIslandNonOcclusive(true);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(180);
    expect(vi.getTimerCount()).toBe(0);
    syncDynamicIslandPlaybackState("playing");
    vi.advanceTimersByTime(240);
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(["减少动态效果", "远程会话", "Linux"])("%s 不使用逐帧透明度动效", (mode) => {
    if (mode === "减少动态效果") mocks.reducedMotion = true;
    if (mode === "远程会话") mocks.richAnimation = false;
    if (mode === "Linux") mocks.isWin = false;
    createDynamicIslandWindow();
    win.emit("ready-to-show");
    syncDynamicIslandPlaybackState("playing");
    expect(visible).toBe(true);
    expect(opacity).toBe(1);
    syncDynamicIslandPlaybackState("paused");
    expect(visible).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    if (mode === "Linux") expect(win.setOpacity).not.toHaveBeenCalled();
  });

  it("非遮挡悬停透明与暂停淡出不打架，窗口隐藏后才清除悬停状态", () => {
    mocks.config.nonOcclusive = true;
    showPlayingWindow();
    mocks.cursor.mockReturnValueOnce({ x: 120, y: 20 });
    vi.advanceTimersByTime(150);
    expect(win.webContents.send).toHaveBeenLastCalledWith("dynamicIsland:cursorInside", true);
    win.webContents.send.mockClear();
    syncDynamicIslandPlaybackState("paused");
    vi.advanceTimersByTime(80);
    expect(visible).toBe(true);
    expect(win.webContents.send).not.toHaveBeenCalledWith("dynamicIsland:cursorInside", false);
    vi.advanceTimersByTime(100);
    expect(visible).toBe(false);
    expect(win.webContents.send).toHaveBeenLastCalledWith("dynamicIsland:cursorInside", false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("旧窗口迟到的 ready、加载完成和 closed 不影响新窗口及其动效", () => {
    createDynamicIslandWindow();
    const oldWindow = win;
    destroyed = true;
    const nextContents = Object.assign(new EventEmitter(), {
      send: vi.fn(),
      setZoomFactor: vi.fn(),
    });
    const nextWindow = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      isVisible: () => visible,
      showInactive: vi.fn(() => {
        visible = true;
      }),
      hide: vi.fn(() => {
        visible = false;
      }),
      focus: vi.fn(),
      getOpacity: () => opacity,
      setOpacity: vi.fn((value: number) => {
        opacity = value;
      }),
      close: vi.fn(() => nextWindow.emit("closed")),
      loadFile: vi.fn(),
      loadURL: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
      getBounds: () => ({ x: 100, y: 0, width: 200, height: 40 }),
      webContents: nextContents,
    });
    mocks.create.mockReturnValueOnce(nextWindow);
    win = nextWindow;
    createDynamicIslandWindow();
    syncDynamicIslandPlaybackState("playing");
    oldWindow.emit("ready-to-show");
    oldWindow.webContents.emit("did-finish-load");
    expect(nextWindow.showInactive).not.toHaveBeenCalled();
    expect(nextContents.setZoomFactor).not.toHaveBeenCalled();
    nextWindow.emit("ready-to-show");
    expect(vi.getTimerCount()).toBe(1);
    oldWindow.emit("closed");
    expect(getDynamicIslandWindow()).toBe(nextWindow);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(240);
    expect(opacity).toBe(1);
    expect(visible).toBe(true);
  });

  it("鼠标位于非遮挡窗口内时关闭，不向已销毁的 webContents 发消息", () => {
    mocks.config.nonOcclusive = true;
    showPlayingWindow();
    mocks.cursor.mockReturnValueOnce({ x: 120, y: 20 });
    vi.advanceTimersByTime(150);
    expect(win.webContents.send).toHaveBeenLastCalledWith("dynamicIsland:cursorInside", true);
    win.webContents.send.mockImplementation(() => {
      if (destroyed) throw new Error("Object has been destroyed");
    });
    expect(() => closeDynamicIslandWindow()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("频繁暂停和恢复只有一轮动效，透明度始终有效且最终状态准确", () => {
    showPlayingWindow();
    for (let i = 0; i < 20; i++) {
      syncDynamicIslandPlaybackState(i % 2 ? "playing" : "paused");
      vi.advanceTimersByTime(16);
      expect(vi.getTimerCount()).toBeLessThanOrEqual(1);
    }
    vi.advanceTimersByTime(240);
    expect(visible).toBe(true);
    expect(opacity).toBe(1);
    for (const [value] of win.setOpacity.mock.calls) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it("系统校时不会延长淡出或留下持续运行的动效计时器", () => {
    showPlayingWindow();
    syncDynamicIslandPlaybackState("paused");
    vi.advanceTimersByTime(32);
    vi.setSystemTime(Date.now() - 60_000);
    vi.advanceTimersByTime(160);
    expect(visible).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("动效中途开启减少动态效果，立即完成目标显隐并清除计时器", () => {
    showPlayingWindow();
    syncDynamicIslandPlaybackState("paused");
    vi.advanceTimersByTime(32);
    mocks.reducedMotion = true;
    applyDynamicIslandPlaybackVisibility();
    expect(visible).toBe(false);
    expect(opacity).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
