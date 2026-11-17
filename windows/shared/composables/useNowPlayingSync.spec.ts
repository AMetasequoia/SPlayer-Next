import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { NowPlayingPositionSync, NowPlayingSnapshot } from "@shared/types/nowPlaying";
import type { LyricLine } from "lyric-kit";
import IslandLyricLine from "@windows/dynamic-island/components/IslandLyricLine.vue";
import { getNowPlayingCurrentMs, useNowPlayingSync } from "./useNowPlayingSync";

let hidden = false;
let frameId = 0;
let wrapper: VueWrapper | null = null;
const frames = new Map<number, FrameRequestCallback>();
const pickIndex = vi.fn(() => 0);
const offPosition = vi.fn();
const offLyric = vi.fn();
const offOffset = vi.fn();
const snapshot = vi.fn();
let positionSync: (data: NowPlayingPositionSync) => void;
let lyricChange: (data: NowPlayingSnapshot) => void;

beforeEach(() => {
  hidden = false;
  frameId = 0;
  frames.clear();
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((id: number) => frames.delete(id)),
  );
  snapshot.mockResolvedValue({
    track: null,
    lyric: [],
    source: null,
    position: 0,
    playing: true,
    state: "playing",
    speed: 1,
    lyricOffsetMs: 0,
    sendTimestamp: Date.now(),
  } satisfies NowPlayingSnapshot);
  vi.stubGlobal("api", {
    nowPlaying: {
      requestSnapshot: snapshot,
      onPositionSync: vi.fn((callback: typeof positionSync) => {
        positionSync = callback;
        return offPosition;
      }),
      onLyricChange: (callback: typeof lyricChange) => {
        lyricChange = callback;
        return offLyric;
      },
      onLyricOffsetChange: () => offOffset,
    },
  });
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  expect(frames.size).toBe(0);
  vi.unstubAllGlobals();
});

/** 推进已排定的一帧，保留回调安排的下一帧 */
const stepFrame = (): void => {
  const pending = [...frames.values()];
  frames.clear();
  for (const callback of pending) callback(performance.now());
};

/** 挂载共享播放同步并等待初始快照 */
const mountSync = async (): Promise<void> => {
  wrapper = mount(
    defineComponent({
      setup() {
        useNowPlayingSync({ pickIndex, logTag: "test" });
        return () => h("div");
      },
    }),
  );
  await flushPromises();
};

/**
 * 更新窗口可见状态并分派浏览器通知
 * @param nextHidden - 是否隐藏
 */
const setHidden = (nextHidden: boolean): void => {
  hidden = nextHidden;
  document.dispatchEvent(new Event("visibilitychange"));
};

/** 挂载逐字歌词组件 */
const mountLine = (): void => {
  const line = {
    startTime: 0,
    endTime: 2000,
    words: [{ startTime: 0, endTime: 2000, word: "测试" }],
    isBG: false,
    isDuet: false,
    translatedLyric: "",
    romanLyric: "",
  } satisfies LyricLine;
  wrapper = mount(IslandLyricLine, {
    props: { line, fontSize: 20, fontWeight: 500, wordByWord: true },
  });
};

describe("共享歌词同步的隐藏节流", () => {
  it("隐藏后立即取消 RAF，重复可见通知不叠加循环", async () => {
    await mountSync();
    stepFrame();
    expect(pickIndex).toHaveBeenCalledOnce();
    expect(frames.size).toBe(1);
    setHidden(true);
    expect(frames.size).toBe(0);
    stepFrame();
    expect(pickIndex).toHaveBeenCalledOnce();
    setHidden(false);
    setHidden(false);
    expect(frames.size).toBe(1);
    stepFrame();
    expect(pickIndex).toHaveBeenCalledTimes(2);
  });

  it("隐藏时接收低频快照不启动 RAF，恢复后从下一次推送校准", async () => {
    hidden = true;
    await mountSync();
    expect(frames.size).toBe(0);
    lyricChange(await snapshot.mock.results[0]!.value);
    expect(frames.size).toBe(0);
    setHidden(false);
    positionSync({
      position: 5000,
      playing: true,
      state: "playing",
      speed: 1,
      sendTimestamp: Date.now(),
    });
    stepFrame();
    expect(getNowPlayingCurrentMs()).toBeGreaterThanOrEqual(5000);
    expect(getNowPlayingCurrentMs()).toBeLessThan(5200);
    expect(snapshot).toHaveBeenCalledOnce();
  });

  it("隐藏时也接收暂停状态，关闭暂停隐藏后不再持续推进歌词", async () => {
    await mountSync();
    stepFrame();
    setHidden(true);
    positionSync({
      position: 1234,
      playing: false,
      state: "paused",
      speed: 1,
      sendTimestamp: Date.now(),
    });
    expect(frames.size).toBe(0);
    setHidden(false);
    stepFrame();
    expect(getNowPlayingCurrentMs()).toBe(1234);
    expect(frames.size).toBe(0);
  });

  it("初始快照未返回就卸载时，不遗留迟到订阅和 RAF", async () => {
    let finish!: (value: NowPlayingSnapshot) => void;
    snapshot.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await mountSync();
    wrapper!.unmount();
    wrapper = null;
    finish({
      track: null,
      lyric: [],
      source: null,
      position: 0,
      playing: true,
      state: "playing",
      speed: 1,
      lyricOffsetMs: 0,
      sendTimestamp: Date.now(),
    });
    await flushPromises();
    expect(window.api.nowPlaying.onPositionSync).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it("暂停只同步一帧，卸载释放所有 IPC 和可见性监听", async () => {
    await mountSync();
    positionSync({
      position: 1234,
      playing: false,
      state: "paused",
      speed: 1,
      sendTimestamp: Date.now(),
    });
    stepFrame();
    expect(getNowPlayingCurrentMs()).toBe(1234);
    expect(frames.size).toBe(0);
    wrapper!.unmount();
    wrapper = null;
    expect(offPosition).toHaveBeenCalledOnce();
    expect(offLyric).toHaveBeenCalledOnce();
    expect(offOffset).toHaveBeenCalledOnce();
    setHidden(true);
    setHidden(false);
    expect(frames.size).toBe(0);
  });
});

describe("灵动岛逐字渲染的隐藏节流", () => {
  it("隐藏后取消逐字 RAF，恢复只启动一个循环", () => {
    mountLine();
    stepFrame();
    expect(frames.size).toBe(1);
    setHidden(true);
    expect(frames.size).toBe(0);
    setHidden(false);
    setHidden(false);
    expect(frames.size).toBe(1);
  });

  it("初始隐藏时不启动动画，显示后继续渲染", () => {
    hidden = true;
    mountLine();
    expect(frames.size).toBe(0);
    setHidden(false);
    stepFrame();
    expect(frames.size).toBe(1);
    expect(wrapper!.find(".dl-word").attributes("style")).toContain("--p:");
  });

  it("卸载后可见性变化不会遗留动画", () => {
    mountLine();
    wrapper!.unmount();
    wrapper = null;
    setHidden(true);
    setHidden(false);
    expect(frames.size).toBe(0);
  });
});
