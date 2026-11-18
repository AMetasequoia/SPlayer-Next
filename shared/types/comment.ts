import type { Track } from "./player";
import type { Platform } from "./platform";

/** 评论来源类型 */
export type CommentSourceKind = "builtin" | "plugin";

/** 评论分页类型 */
export type CommentTab = "hot" | "new";

/** 评论来源 */
export interface CommentSource {
  id: string;
  name: string;
  kind: CommentSourceKind;
  platform?: Platform;
  /** 该来源支持的评论标签，未声明时默认全部支持 */
  tabs?: CommentTab[];
  pluginId?: string;
  pluginSource?: string;
}

/** 单条歌曲评论 */
export interface MusicCommentItem {
  id: string;
  userId?: string;
  userName: string;
  avatar?: string;
  text: string;
  time?: number;
  location?: string;
  likedCount?: number;
  /** 当前网易云账号是否已点赞 */
  liked?: boolean;
  images?: string[];
  replyTotal?: number;
  reply?: MusicCommentItem[];
  hasMoreReply?: boolean;
}

/** 歌曲评论分页 */
export interface MusicCommentPage {
  list: MusicCommentItem[];
  total: number;
  page: number;
  limit: number;
  /** 下一页游标 */
  nextCursor?: string;
}

/** 评论查询参数 */
export interface MusicCommentQuery {
  sourceId: string;
  track: Track;
  type: CommentTab;
  page: number;
  limit: number;
  /** 当前页游标 */
  cursor?: string;
}

/** 评论 IPC 响应 */
export type MusicCommentResponse =
  { ok: true; data: MusicCommentPage } | { ok: false; error: string };

/** 渲染端评论 API */
export interface CommentsApi {
  sources: () => Promise<CommentSource[]>;
  get: (args: MusicCommentQuery) => Promise<MusicCommentResponse>;
  resource: (args: NeteaseCommentQuery) => Promise<NeteaseCommentResponse>;
  setLiked: (args: NeteaseCommentLikeQuery) => Promise<CommentLikeResponse>;
}

/** 网易云评论目标，不使用歌曲搜索匹配 */
export interface NeteaseCommentTarget {
  type: "song" | "album" | "playlist";
  id: string;
}

/** 网易云资源评论读取参数 */
export interface NeteaseCommentQuery {
  target: NeteaseCommentTarget;
  type: CommentTab;
  page: number;
  cursor?: string;
}

/** 当前页评论及其所属主进程会话 */
export interface NeteaseCommentPage extends MusicCommentPage {
  hasMore: boolean;
  session: number;
}

/** 显式点赞操作，绑定读取评论时的会话 */
export interface NeteaseCommentLikeQuery {
  target: NeteaseCommentTarget;
  commentId: string;
  liked: boolean;
  session: number;
}

export type NeteaseCommentResponse =
  { ok: true; data: NeteaseCommentPage } | { ok: false; error: string };

export type CommentLikeResponse = { ok: true } | { ok: false; error: string };
