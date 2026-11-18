import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerCommentsIpc } from "./comments";
import type { NeteaseCommentLikeQuery, NeteaseCommentQuery } from "@shared/types/comment";

const mocks = vi.hoisted(() => ({ handle: vi.fn(), read: vi.fn(), like: vi.fn() }));
vi.mock("electron", () => ({ ipcMain: { handle: mocks.handle } }));
vi.mock("@main/services/comments", () => ({
  getCommentSources: vi.fn(),
  getMusicComments: vi.fn(),
}));
vi.mock("@main/services/comments/netease", () => ({
  getNeteaseResourceComments: mocks.read,
  setNeteaseCommentLiked: mocks.like,
}));
vi.mock("@main/utils/logger", () => ({ coreLog: { warn: vi.fn() } }));

beforeEach(() => {
  vi.resetAllMocks();
  registerCommentsIpc();
});
/** 获取已注册 IPC 的处理器，模拟主进程事件调用 */
const handler = (
  channel: string,
): ((_event: unknown, query: NeteaseCommentQuery | NeteaseCommentLikeQuery) => Promise<unknown>) =>
  mocks.handle.mock.calls.find(([name]) => name === channel)![1];
const target = { type: "album" as const, id: "10" };

describe("网易云评论 IPC", () => {
  it("资源读取与写入走独立服务，不调用旧多来源歌曲服务", async () => {
    const query = { target, type: "new" as const, page: 1 };
    mocks.read.mockResolvedValue({ list: [], session: 3 });
    expect(await handler("comments:resource")(null, query)).toEqual({
      ok: true,
      data: { list: [], session: 3 },
    });
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith(query);
    const like = { target, commentId: "100", liked: true, session: 3 };
    expect(await handler("comments:setLiked")(null, like)).toEqual({ ok: true });
    expect(mocks.like).toHaveBeenCalledExactlyOnceWith(like);
  });
  it("失败返回错误而非空列表或伪成功，不自行重试", async () => {
    mocks.like.mockRejectedValueOnce(new Error("denied"));
    expect(
      await handler("comments:setLiked")(null, {
        target,
        commentId: "100",
        liked: true,
        session: 1,
      }),
    ).toEqual({ ok: false, error: "denied" });
    expect(mocks.like).toHaveBeenCalledOnce();
  });
});
