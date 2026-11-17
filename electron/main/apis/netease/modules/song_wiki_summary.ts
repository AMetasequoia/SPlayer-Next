import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

/**
 * 获取歌曲百科正文，而非客户端跳转信息
 * @param query - 包含歌曲 id 的请求参数
 * @param request - 共用请求方法
 * @returns 百科模块与个人音乐故事
 */
const song_wiki_summary: NeteaseModule = (query, request) =>
  request("/api/song/play/about/block/page", { songId: query.id }, createOption(query));

export default song_wiki_summary;
