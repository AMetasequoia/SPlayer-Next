import type { NeteaseCommentTarget } from "../types/comment";
import type { Track } from "../types/player";

export const NETEASE_COMMENT_PREFIXES = {
  song: "R_SO_4_",
  album: "R_AL_3_",
  playlist: "A_PL_0_",
} as const;

/**
 * 校验网易云资源身份，不将字符串 ID 转为浮点数
 * @param target - 待检查的评论目标
 */
export const isNeteaseCommentTarget = (target: NeteaseCommentTarget): boolean =>
  !!target &&
  Object.hasOwn(NETEASE_COMMENT_PREFIXES, target.type) &&
  typeof target.id === "string" &&
  /^[1-9]\d*$/.test(target.id);

/**
 * 仅网易云歌曲提供评论入口，使用播放 ID 而非 cloudId
 * @param track - 当前操作歌曲
 */
export const isNeteaseCommentTrack = (track: Track | null | undefined): track is Track =>
  track?.source === "netease" && isNeteaseCommentTarget({ type: "song", id: track.id });
