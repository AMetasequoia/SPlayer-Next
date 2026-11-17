import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Track } from "@shared/types/player";

vi.mock("@main/store", () => ({ store: { get: () => ({}) } }));

describe("交接后的歌词窗口锚点", () => {
  beforeEach(() => vi.resetModules());

  it("等新曲歌词到达再采用引擎锚点，后续歌词更新不覆盖新进度", async () => {
    const service = await import("./nowPlaying");
    service.update({ id: "old" } as Track, [], null);
    service.prepareTransition("next", {
      position: 2400,
      state: "playing",
      speed: 1.5,
      timestamp: 12345,
    });
    expect(service.snapshot().track?.id).toBe("old");
    service.update({ id: "next" } as Track, [], null);
    expect(service.snapshot()).toMatchObject({
      position: 2400,
      speed: 1.5,
      sendTimestamp: 12345,
      playing: true,
    });
    service.onPosition(3000, true);
    service.update({ id: "next" } as Track, [], null);
    expect(service.snapshot().position).toBe(3000);
  });

  it("高频进度只发可见窗口，暂停和倍速变化仍通知隐藏窗口", async () => {
    const service = await import("./nowPlaying");
    const listener = vi.fn();
    const off = service.onPositionSync(listener);
    service.onPosition(1000, true);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ playing: true }), true);
    service.onPlayStateChange("paused");
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ playing: false, state: "paused" }),
      false,
    );
    service.onSpeedChange(1.5);
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ speed: 1.5 }), false);
    off();
    listener.mockClear();
    service.onPosition(2000, true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("暂停的交接不会把歌词窗口恢复为播放态", async () => {
    const service = await import("./nowPlaying");
    service.prepareTransition("next", {
      position: 1700,
      state: "paused",
      speed: 1,
      timestamp: 12345,
    });
    service.update({ id: "next" } as Track, [], null);
    expect(service.snapshot()).toMatchObject({ position: 1700, playing: false, state: "paused" });
  });
});
