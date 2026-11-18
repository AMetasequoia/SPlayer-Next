import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NeteaseCommentQuery, NeteaseCommentTarget } from "@shared/types/comment";
import { getNeteaseResourceComments, setNeteaseCommentLiked } from "./netease";
import { normalizeNeteaseComment } from "./data";

const api = vi.hoisted(() => ({
  call: vi.fn(),
  ensure: vi.fn(),
  session: 1,
  cookie: { MUSIC_U: "account-a" } as Record<string, string>,
}));
vi.mock("@main/apis/netease", () => ({
  callNetease: api.call,
  ensureNeteaseAnonymousSession: api.ensure,
  getNeteaseSessionVersion: () => api.session,
  getNeteaseCookies: () => ({ ...api.cookie }),
}));
const raw = {
  commentId: "9007199254740993",
  content: "评论",
  time: 1700000000000,
  liked: true,
  likedCount: 5,
  user: { userId: "9007199254740995", nickname: "用户" },
  beReplied: [{ beRepliedCommentId: "1", content: "引用", user: { nickname: "回复者" } }],
};
/** 构造三类资源共用的接口响应 */
const response = (code = 200) => ({
  status: 200,
  body: { code, hotComments: [raw], data: { comments: [raw], totalCount: 50, hasMore: true } },
});
const target: NeteaseCommentTarget = { type: "song", id: "9007199254740997" };
const query: NeteaseCommentQuery = { target, type: "new", page: 1 };
const like = { target, commentId: raw.commentId, liked: false, session: 1 };

beforeEach(() => {
  vi.resetAllMocks();
  api.session = 1;
  api.cookie = { MUSIC_U: "account-a" };
  api.ensure.mockResolvedValue(undefined);
  api.call.mockResolvedValue(response());
});

describe("网易云评论归一化复用", () => {
  it("保留账号点赞、HTTP 图片和一层引用，不保留深层回复树", () => {
    const result = normalizeNeteaseComment({
      ...raw,
      picInfo: { picUrl: "https://img/comment" },
      beReplied: [{ ...raw, beReplied: [raw] }],
    });
    expect(result).toMatchObject({ liked: true, images: ["https://img/comment"] });
    expect(result?.reply).toHaveLength(1);
    expect(result?.reply?.[0].reply).toBeUndefined();
  });
  it("未知图片协议和无正文项不透传到页面", () => {
    expect(
      normalizeNeteaseComment({ ...raw, picInfo: { picUrl: "javascript:alert(1)" } })?.images,
    ).toBeUndefined();
    expect(normalizeNeteaseComment({ ...raw, content: "  " })).toBeNull();
  });
});

describe("网易云资源评论读取", () => {
  it.each([
    ["song", "R_SO_4_"],
    ["album", "R_AL_3_"],
    ["playlist", "A_PL_0_"],
  ] as const)("%s 使用确定资源前缀，不搜索匹配歌曲", async (type, prefix) => {
    const result = await getNeteaseResourceComments({ ...query, target: { ...target, type } });
    expect(api.call).toHaveBeenCalledExactlyOnceWith(
      "comment_new",
      expect.objectContaining({
        threadId: `${prefix}${target.id}`,
        id: target.id,
        cookie: { MUSIC_U: "account-a" },
      }),
    );
    expect(result).toMatchObject({
      session: 1,
      hasMore: true,
      nextCursor: "1700000000000",
      total: 50,
    });
    expect(result.list[0]).toMatchObject({
      id: raw.commentId,
      liked: true,
      likedCount: 5,
      userId: "9007199254740995",
      reply: [{ text: "引用" }],
    });
    expect(JSON.stringify(result)).not.toContain("account-a");
  });
  it("热门评论使用同资源前缀且不把全部评论总数当热门条数", async () => {
    const result = await getNeteaseResourceComments({
      ...query,
      target: { type: "album", id: "12" },
      type: "hot",
    });
    expect(api.call).toHaveBeenCalledWith(
      "comment_hot",
      expect.objectContaining({ type: "R_AL_3_", id: "12" }),
    );
    expect(result).toMatchObject({ total: 1, hasMore: false });
  });
  it("下一批发送原始评论游标，即使尾项没有正文也不使用过滤后的尾项", async () => {
    api.call.mockResolvedValue({
      status: 200,
      body: {
        code: 200,
        data: {
          comments: [raw, { commentId: "2", content: "", time: 1699999999999 }],
          hasMore: true,
        },
      },
    });
    const result = await getNeteaseResourceComments({ ...query, page: 2, cursor: "1700000000001" });
    expect(result.list).toHaveLength(1);
    expect(result.nextCursor).toBe("1699999999999");
    expect(api.call).toHaveBeenCalledWith(
      "comment_new",
      expect.objectContaining({ cursor: "1700000000001", page: 2 }),
    );
  });
  it.each([
    { ...query, target: { type: "song", id: "0" } },
    { ...query, target: { type: "radio", id: "1" } },
    { ...query, page: 0 },
    { ...query, page: 1.5 },
    { ...query, page: 2 },
  ])("无效参数不访问平台：%j", async (args) => {
    await expect(getNeteaseResourceComments(args as NeteaseCommentQuery)).rejects.toThrow();
    expect(api.call).not.toHaveBeenCalled();
  });
  it("业务失败不能归一化为空列表，不自动重试", async () => {
    api.call.mockResolvedValue(response(301));
    await expect(getNeteaseResourceComments(query)).rejects.toThrow("评论加载失败");
    expect(api.call).toHaveBeenCalledOnce();
  });
  it.each(["1700000000000", "1699999999999"])(
    "重复或逆序游标 %s 不能无限追加评论",
    async (cursor) => {
      await expect(getNeteaseResourceComments({ ...query, page: 2, cursor })).rejects.toThrow(
        "游标",
      );
    },
  );

  it("空评论结束分页，错误的重复游标不能无限加载", async () => {
    api.call.mockResolvedValue({
      status: 200,
      body: { code: 200, data: { comments: [], hasMore: false, totalCount: 0 } },
    });
    expect(await getNeteaseResourceComments(query)).toMatchObject({
      list: [],
      hasMore: false,
      total: 0,
    });
    api.call.mockResolvedValue(response());
    await expect(
      getNeteaseResourceComments({ ...query, page: 2, cursor: "1700000000000" }),
    ).rejects.toThrow("游标");
  });
  it("读取期间换账号，旧响应不得交给新页面", async () => {
    api.call.mockImplementation(async () => {
      api.session++;
      return response();
    });
    await expect(getNeteaseResourceComments(query)).rejects.toThrow("账号状态已变化");
  });
});

describe("评论点赞账号写入", () => {
  it("显式状态和两种 ID 发给正确模块，并绑定原会话 Cookie", async () => {
    await setNeteaseCommentLiked(like);
    expect(api.call).toHaveBeenCalledExactlyOnceWith("comment_like", {
      threadId: `R_SO_4_${target.id}`,
      commentId: raw.commentId,
      liked: false,
      cookie: { MUSIC_U: "account-a" },
    });
  });
  it("游客和失效会话不提交", async () => {
    api.cookie = {};
    await expect(setNeteaseCommentLiked(like)).rejects.toThrow("请先登录");
    api.cookie = { MUSIC_U: "account-b" };
    api.session = 2;
    await expect(setNeteaseCommentLiked(like)).rejects.toThrow("账号状态已变化");
    expect(api.call).not.toHaveBeenCalled();
  });
  it("重复点击在途去重，结束后允许显式取消或重试", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    api.call.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = setNeteaseCommentLiked(like);
    await expect(setNeteaseCommentLiked(like)).rejects.toThrow("正在提交");
    expect(api.call).toHaveBeenCalledOnce();
    finish(response());
    await pending;
    await setNeteaseCommentLiked({ ...like, liked: true });
    expect(api.call).toHaveBeenCalledTimes(2);
  });
  it("离开再返回时，读取等待原资源的在途点赞完成，避免读回旧点赞状态", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    api.call.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const write = setNeteaseCommentLiked(like);
    const read = getNeteaseResourceComments(query);
    await Promise.resolve();
    await Promise.resolve();
    expect(api.call).toHaveBeenCalledOnce();
    finish(response());
    await write;
    await read;
    expect(api.call).toHaveBeenCalledTimes(2);
    expect(api.call.mock.calls[1][0]).toBe("comment_new");
  });

  it("写入失败不自动重试，迟到成功也不冒充新账号的成功", async () => {
    api.call.mockResolvedValueOnce(response(500));
    await expect(setNeteaseCommentLiked(like)).rejects.toThrow("点赞失败");
    expect(api.call).toHaveBeenCalledOnce();
    api.call.mockImplementationOnce(async () => {
      api.session++;
      return response();
    });
    await expect(setNeteaseCommentLiked(like)).rejects.toThrow("账号状态已变化");
  });
});
