import { describe, expect, it, vi } from "vitest";
import cloudMatch from "./cloud_match";

const response = { status: 200, body: { code: 200 }, cookie: [] };

describe("云盘歌曲纠正请求", () => {
  it("保留云盘与目标 ID 的字符串精度，并使用当前会话的 weapi 请求", async () => {
    const request = vi.fn().mockResolvedValue(response);
    const cookie = { MUSIC_U: "test-session" };

    expect(
      await cloudMatch(
        { uid: 1, sid: "9007199254740993", asid: "9007199254740995", cookie },
        request,
      ),
    ).toBe(response);
    expect(request).toHaveBeenCalledExactlyOnceWith(
      "/api/cloud/user/song/match",
      { userId: 1, songId: "9007199254740993", adjustSongId: "9007199254740995" },
      expect.objectContaining({ crypto: "weapi", cookie }),
    );
  });

  it("失败原样返回，不自动重试账号写入", async () => {
    const error = new Error("平台拒绝纠正");
    const request = vi.fn().mockRejectedValue(error);

    await expect(cloudMatch({ uid: 1, sid: "10", asid: "20" }, request)).rejects.toBe(error);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
