import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchUserCloud, matchCloudSong, deleteCloudSongs } from "./netease";

const call = vi.fn();

beforeEach(() => {
  call.mockReset();
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { apis: { call } },
  });
});

describe("云盘身份与纠正接口", () => {
  it("云盘条目 ID 独立于播放 ID，不丢失字符串精度", async () => {
    call.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        code: 200,
        data: [
          { songId: "9007199254740993", simpleSong: { id: 20, name: "歌曲", dt: 1000 } },
          { songId: 30 },
        ],
        count: 2,
        hasMore: false,
      },
    });

    const page = await fetchUserCloud(0);

    expect(page.tracks).toHaveLength(1);
    expect(page.tracks[0]).toMatchObject({
      id: "20",
      cloudId: "9007199254740993",
      cloud: true,
      source: "netease",
    });
    expect(page.count).toBe(2);
  });

  it("旧云盘响应未提供条目 ID 时保留歌曲 ID", async () => {
    call.mockResolvedValue({
      ok: true,
      body: { code: 200, data: [{ simpleSong: { id: 20, name: "歌曲" } }] },
    });

    expect((await fetchUserCloud(0)).tracks[0].cloudId).toBe("20");
  });

  it("纠正请求使用原云盘 ID 与已验证的目标 ID", async () => {
    call.mockResolvedValue({ ok: true, body: { code: 200 } });

    await matchCloudSong(1, "9007199254740993", "20");

    expect(call).toHaveBeenCalledExactlyOnceWith("netease", "cloud_match", {
      uid: 1,
      sid: "9007199254740993",
      asid: "20",
    });
  });

  it("删除云盘条目同样保留 ID 精度", async () => {
    call.mockResolvedValue({ ok: true, body: { code: 200 } });
    await deleteCloudSongs(["9007199254740993"]);
    expect(call).toHaveBeenCalledExactlyOnceWith("netease", "user_cloud_del", {
      id: ["9007199254740993"],
    });
  });

  it("传输成功但业务失败时不能报告纠正成功", async () => {
    call.mockResolvedValue({ ok: true, body: { code: 400, message: "目标歌曲不可用" } });

    await expect(matchCloudSong(1, "10", "20")).rejects.toThrow("目标歌曲不可用");
  });
});
