import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

/** 按时间读取资源评论，后续页使用上一批原始评论的时间游标 */
const comment_new: NeteaseModule = (query, request) =>
  request(
    "/api/v2/resource/comments",
    {
      threadId: query.threadId,
      pageNo: query.page,
      pageSize: 20,
      showInner: true,
      cursor: query.page === 1 ? "0" : query.cursor,
      sortType: 3,
    },
    createOption(query),
  );

export default comment_new;
