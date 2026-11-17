import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

/**
 * 将云盘歌曲关联到指定的曲库歌曲
 * @param query - 用户 ID、云盘歌曲 ID 和目标歌曲 ID
 * @param request - 复用登录会话的请求方法
 * @returns 平台纠正结果
 */
const cloudMatch: NeteaseModule = (query, request) =>
  request(
    "/api/cloud/user/song/match",
    { userId: query.uid, songId: query.sid, adjustSongId: query.asid },
    createOption(query, "weapi"),
  );

export default cloudMatch;
