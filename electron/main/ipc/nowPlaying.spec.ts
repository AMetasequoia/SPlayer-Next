import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ broadcast: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { on: vi.fn(), handle: vi.fn() } }));
vi.mock("@main/store", () => ({ store: { get: () => ({}) } }));
vi.mock("@main/utils/broadcast", () => ({ broadcast: mocks.broadcast }));
vi.mock("@main/server/broadcast", () => ({ wsBroadcast: vi.fn() }));

import { registerNowPlayingIpc } from "./nowPlaying";
import * as service from "@main/services/nowPlaying";

describe("隐藏歌词窗口的状态同步", () => {
  it("高频进度启用可见性过滤，暂停和恢复不能被过滤", () => {
    registerNowPlayingIpc();
    service.onPosition(1000, true);
    expect(mocks.broadcast).toHaveBeenLastCalledWith(
      "nowPlaying:position-sync",
      expect.objectContaining({ playing: true }),
      true,
    );
    service.onPlayStateChange("paused");
    expect(mocks.broadcast).toHaveBeenLastCalledWith(
      "nowPlaying:position-sync",
      expect.objectContaining({ playing: false, state: "paused" }),
      false,
    );
    service.onPlayStateChange("playing");
    expect(mocks.broadcast).toHaveBeenLastCalledWith(
      "nowPlaying:position-sync",
      expect.objectContaining({ playing: true }),
      false,
    );
    service.onSpeedChange(1.5);
    expect(mocks.broadcast).toHaveBeenLastCalledWith(
      "nowPlaying:position-sync",
      expect.objectContaining({ speed: 1.5 }),
      false,
    );
  });
});
