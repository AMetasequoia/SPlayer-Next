import { describe, expect, it, vi } from "vitest";
import { loadNeteaseCollection } from "./netease";
import { toPlaylist } from "@/utils/format/netease";

const mocks = vi.hoisted(() => ({ playlist: vi.fn() }));
vi.mock("@/apis/playlist/netease", () => ({ fetchPlaylist: mocks.playlist }));
vi.mock("@/apis/album/netease", () => ({ fetchAlbum: vi.fn() }));

describe("网易云合集评论可见性元数据", () => {
  it.each([0, 10])(
    "歌单 privacy=%s 从原始详情保留至当前合集，不把隐私标记丢失",
    async (privacy) => {
      const meta = toPlaylist({ id: "9007199254740993", name: "歌单", privacy });
      expect(meta.privacy).toBe(privacy);
      mocks.playlist.mockImplementationOnce(async (_id, options) => options.onMeta(meta));
      const onUpdate = vi.fn();
      await loadNeteaseCollection("playlist", "9007199254740993", { onUpdate });
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ id: "9007199254740993", privacy }),
      );
    },
  );
});
