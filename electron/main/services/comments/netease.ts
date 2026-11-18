import {
  callNetease,
  ensureNeteaseAnonymousSession,
  getNeteaseCookies,
  getNeteaseSessionVersion,
} from "@main/apis/netease";
import type {
  MusicCommentItem,
  NeteaseCommentLikeQuery,
  NeteaseCommentPage,
  NeteaseCommentQuery,
} from "@shared/types/comment";
import { isNeteaseCommentTarget, NETEASE_COMMENT_PREFIXES } from "@shared/utils/comments";

import { normalizeNeteaseComment, type NeteaseComment } from "./data";

/** 只保留在途写入，finally 删除；返回原页面的读取先等待这些写入完成 */
const pendingLikes = new Map<string, Promise<void>>();

/**
 * 读取指定网易云歌曲、专辑或歌单的评论，不搜索或调用其他评论源
 * @param args - 资源身份与分页参数
 * @returns 包含分页游标和会话代次的评论
 */
export const getNeteaseResourceComments = async (
  args: NeteaseCommentQuery,
): Promise<NeteaseCommentPage> => {
  if (!isNeteaseCommentTarget(args?.target) || !["hot", "new"].includes(args.type)) {
    throw new Error("无效的网易云评论资源");
  }
  const page = args.page;
  if (!Number.isSafeInteger(page) || page < 1 || (args.type === "hot" && page !== 1)) {
    throw new Error("无效的评论页码");
  }
  if (args.type === "new" && page > 1 && !/^[1-9]\d*$/.test(args.cursor ?? "")) {
    throw new Error("缺少有效的评论时间游标");
  }
  await ensureNeteaseAnonymousSession();
  const session = getNeteaseSessionVersion();
  const resourceKey = `${session}:${args.target.type}:${args.target.id}:`;
  const writes = [...pendingLikes]
    .filter(([key]) => key.startsWith(resourceKey))
    .map(([, pending]) => pending);
  await Promise.allSettled(writes);
  if (session !== getNeteaseSessionVersion()) throw new Error("账号状态已变化，请重新加载评论");
  const prefix = NETEASE_COMMENT_PREFIXES[args.target.type];
  const { status, body } = await callNetease(args.type === "hot" ? "comment_hot" : "comment_new", {
    id: args.target.id,
    type: prefix,
    threadId: `${prefix}${args.target.id}`,
    page,
    limit: 20,
    offset: 0,
    cursor: args.cursor,
    cookie: getNeteaseCookies(),
  });
  if (session !== getNeteaseSessionVersion()) throw new Error("账号状态已变化，请重新加载评论");
  if (status !== 200 || Number(body?.code) !== 200) {
    throw new Error(body?.message || body?.msg || "评论加载失败");
  }
  const raw: NeteaseComment[] = args.type === "hot" ? body.hotComments : body.data?.comments;
  if (!Array.isArray(raw)) throw new Error("评论响应格式错误");
  const lastTime = raw.at(-1)?.time;
  const nextCursor =
    typeof lastTime === "number" && Number.isSafeInteger(lastTime) && lastTime > 0
      ? String(lastTime)
      : undefined;
  const hasMore = args.type === "new" && body.data?.hasMore === true;
  if (
    hasMore &&
    (!nextCursor || (page > 1 && args.cursor && BigInt(nextCursor) >= BigInt(args.cursor)))
  ) {
    throw new Error("评论分页游标无效，请重新加载");
  }
  return {
    list: raw
      .map((item) => normalizeNeteaseComment(item))
      .filter((item): item is MusicCommentItem => item !== null),
    total: args.type === "hot" ? raw.length : (body.data?.totalCount ?? raw.length),
    page,
    limit: 20,
    hasMore,
    nextCursor,
    session,
  };
};

/**
 * 显式提交评论点赞，同会话同评论在途去重，不重试或缓存账号写入
 * @param args - 资源、评论、期望点赞状态和读取时的会话代次
 */
export const setNeteaseCommentLiked = async (args: NeteaseCommentLikeQuery): Promise<void> => {
  if (
    !isNeteaseCommentTarget(args?.target) ||
    typeof args.commentId !== "string" ||
    !/^[1-9]\d*$/.test(args.commentId) ||
    typeof args.liked !== "boolean"
  )
    throw new Error("无效的评论点赞参数");
  const cookie = getNeteaseCookies();
  if (!cookie.MUSIC_U) throw new Error("请先登录网易云账号");
  if (args.session !== getNeteaseSessionVersion())
    throw new Error("账号状态已变化，请重新加载评论");
  const key = `${args.session}:${args.target.type}:${args.target.id}:${args.commentId}`;
  if (pendingLikes.has(key)) throw new Error("该评论正在提交，请稍候");
  const pending = (async () => {
    const { status, body } = await callNetease("comment_like", {
      threadId: `${NETEASE_COMMENT_PREFIXES[args.target.type]}${args.target.id}`,
      commentId: args.commentId,
      liked: args.liked,
      cookie,
    });
    if (args.session !== getNeteaseSessionVersion())
      throw new Error("账号状态已变化，请重新加载评论");
    if (status !== 200 || Number(body?.code) !== 200) {
      throw new Error(body?.message || body?.msg || "评论点赞失败");
    }
  })();
  pendingLikes.set(key, pending);
  try {
    await pending;
  } finally {
    pendingLikes.delete(key);
  }
};
