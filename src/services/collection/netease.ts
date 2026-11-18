import type { Track } from "@shared/types/player";
import type { Collection, CollectionType } from "@/types/collection";
import { fetchAlbum } from "@/apis/album/netease";
import { fetchPlaylist } from "@/apis/playlist/netease";
import type { LoadCollectionOptions } from "./types";

/**
 * 加载网易云合集，保留歌单隐私标记以控制评论入口
 * @param type - 合集类型
 * @param id - 资源 ID
 * @param options - 加载回调和取消信号
 */
export const loadNeteaseCollection = async (
  type: CollectionType,
  id: string,
  options: LoadCollectionOptions,
): Promise<void> => {
  if (type === "album") {
    const result = await fetchAlbum(decodeURIComponent(id));
    if (options.signal?.aborted) return;
    options.onUpdate(
      result
        ? {
            id,
            type,
            source: "netease",
            title: result.album.name,
            cover: result.album.cover,
            description: result.description,
            creator: result.album.artist,
            tracks: result.tracks,
            trackCount: result.tracks.length,
          }
        : null,
    );
    return;
  }
  if (type !== "playlist") {
    options.onUpdate(null);
    return;
  }

  const tracks: Track[] = [];
  let meta: {
    name: string;
    cover?: string;
    description?: string;
    creator?: string;
    count?: number;
    privacy?: number;
  };
  const current = (): Collection | null =>
    meta
      ? {
          id,
          type,
          source: "netease",
          title: meta.name,
          cover: meta.cover,
          description: meta.description,
          creator: meta.creator,
          privacy: meta.privacy,
          tracks: [...tracks],
          trackCount: meta.count ?? tracks.length,
        }
      : null;
  await fetchPlaylist(id, {
    signal: options.signal,
    onMeta: (value) => {
      meta = {
        name: value.name,
        cover: value.cover,
        description: value.description,
        creator: value.owner,
        count: value.trackCount,
        privacy: value.privacy,
      };
      if (!options.signal?.aborted) options.onUpdate(current());
    },
    onBatch: (batch) => {
      tracks.push(...batch);
      if (!options.signal?.aborted) options.onUpdate(current());
    },
  });
};
