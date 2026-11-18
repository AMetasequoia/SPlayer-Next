import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

/** 点赞或取消点赞评论，资源身份与评论 ID 必须同时提供 */
const comment_like: NeteaseModule = (query, request) =>
  request(
    `/api/v1/comment/${query.liked ? "like" : "unlike"}`,
    { threadId: query.threadId, commentId: query.commentId },
    createOption(query, "weapi"),
  );

export default comment_like;
