import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

/**
 * 获取当前账号的歌曲收听记录
 * @param query - 包含歌曲 id 的请求参数
 * @param request - 共用请求方法
 * @returns 初次收听、播放次数和红心记录
 */
const music_first_listen_info: NeteaseModule = (query, request) =>
  request(
    "/api/content/activity/music/first/listen/info",
    { songId: query.id },
    createOption(query),
  );

export default music_first_listen_info;
