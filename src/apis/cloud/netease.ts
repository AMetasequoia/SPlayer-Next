import type { Track } from "@shared/types/player";
import type { NeteaseSong } from "@shared/types/platform/netease";
import { netease as neteaseApi } from "@/apis/netease";
import { ensureOk, songToTrack } from "@/utils/format/netease";

interface CloudItem {
  songId?: number | string;
  fileName?: string;
  fileSize?: number;
  simpleSong?: NeteaseSong;
}

interface UserCloudBody {
  code?: number;
  data?: CloudItem[];
  count?: number;
  size?: number;
  maxSize?: number;
  hasMore?: boolean;
}

export interface CloudPage {
  /** 本页转换后的曲目 */
  tracks: Track[];
  /** 云盘总曲目数 */
  count: number;
  /** 已用容量（字节） */
  size: number;
  /** 总容量（字节） */
  maxSize: number;
  /** 是否还有下一页 */
  hasMore: boolean;
}

/**
 * 拉取一页云盘数据
 * @param offset - 偏移
 * @param limit - 单页数量
 * @returns 带云盘条目身份的曲目分页
 */
export const fetchUserCloud = async (offset: number, limit = 200): Promise<CloudPage> => {
  const body = (await neteaseApi.user_cloud({ offset, limit })) as UserCloudBody;
  ensureOk(body);
  const tracks = (body.data ?? []).flatMap(({ simpleSong, songId }) =>
    simpleSong
      ? [{ ...songToTrack(simpleSong), cloud: true, cloudId: String(songId ?? simpleSong.id) }]
      : [],
  );
  return {
    tracks,
    count: body.count ?? 0,
    size: body.size ?? 0,
    maxSize: body.maxSize ?? 0,
    hasMore: body.hasMore ?? offset + tracks.length < (body.count ?? 0),
  };
};

/**
 * 纠正云盘歌曲与曲库歌曲的关联
 * @param userId - 当前用户 ID
 * @param songId - 云盘条目 ID
 * @param targetId - 验证后的目标歌曲 ID
 */
export const matchCloudSong = async (
  userId: number,
  songId: string,
  targetId: string,
): Promise<void> => {
  ensureOk(await neteaseApi.cloud_match({ uid: userId, sid: songId, asid: targetId }));
};

/**
 * 从云盘删除歌曲
 * @param ids - 云盘条目 ID 列表，保留字符串精度
 */
export const deleteCloudSongs = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  ensureOk(await neteaseApi.user_cloud_del({ id: ids }));
};
