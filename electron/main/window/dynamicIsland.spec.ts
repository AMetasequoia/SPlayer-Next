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
}));
vi.mock("electron", () => {
  const display = {
    scaleFactor: 1,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  };
  return {
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
vi.mock("@main/utils/config", () => ({ isMac: false }));
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
let win: EventEmitter & {
  showInactive: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  webContents: EventEmitter & { send: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.config = structuredClone(defaultSystemConfig.dynamicIsland);
  mocks.saved = { mode: "snapped", x: null, y: null, visible: false };
  visible = false;
  destroyed = false;
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
