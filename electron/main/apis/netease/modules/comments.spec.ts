import { beforeEach, describe, expect, it, vi } from "vitest";
import commentNew from "./comment_new";
import commentLike from "./comment_like";

vi.mock("../core/option", () => ({ createOption: (_q: unknown, crypto = "eapi") => ({ crypto }) }));
const request = vi.fn();
beforeEach(() =>
  request.mockReset().mockResolvedValue({ status: 200, body: { code: 200 }, cookie: [] }),
);

describe("网易云资源评论接口", () => {
  it.each(["R_SO_4_", "R_AL_3_", "A_PL_0_"])(
    "%s 最新评论保留资源字符串 ID 与时间游标",
    async (prefix) => {
      await commentNew(
        { threadId: `${prefix}9007199254740993`, page: 2, cursor: "1700000000000" },
        request,
      );
      expect(request).toHaveBeenCalledExactlyOnceWith(
        "/api/v2/resource/comments",
        {
          threadId: `${prefix}9007199254740993`,
          pageNo: 2,
          pageSize: 20,
          showInner: true,
          cursor: "1700000000000",
          sortType: 3,
        },
        { crypto: "eapi" },
      );
    },
  );
  it("首批评论使用零游标", async () => {
    await commentNew({ threadId: "R_SO_4_1", page: 1 }, request);
    expect(request.mock.calls[0][1].cursor).toBe("0");
  });
  it.each([true, false])("评论点赞状态 %s 使用评论专用接口，不是资源点赞", async (liked) => {
    await commentLike(
      { threadId: "A_PL_0_9007199254740993", commentId: "9007199254740995", liked },
      request,
    );
    expect(request).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/comment/${liked ? "like" : "unlike"}`,
      {
        threadId: "A_PL_0_9007199254740993",
        commentId: "9007199254740995",
      },
      { crypto: "weapi" },
    );
  });
  it.each([commentNew, commentLike])("网络失败不自动重试", async (module) => {
    request.mockRejectedValueOnce(new Error("offline"));
    await expect(module({ threadId: "R_AL_3_1" }, request)).rejects.toThrow("offline");
    expect(request).toHaveBeenCalledOnce();
  });
});
