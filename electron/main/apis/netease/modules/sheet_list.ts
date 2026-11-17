import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

/**
 * 获取歌曲关联乐谱
 * @param query - 包含歌曲 id 的请求参数
 * @param request - 共用请求方法
 * @returns 乐谱摘要列表
 */
const sheet_list: NeteaseModule = (query, request) =>
  request(
    "/api/music/sheet/list/v1",
    { id: query.id, abTest: query.ab || "b" },
    createOption(query),
  );

export default sheet_list;
