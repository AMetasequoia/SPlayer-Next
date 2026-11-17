import { describe, expect, it, vi } from "vitest";
import { ref, shallowRef } from "vue";
import type { Track } from "@shared/types/player";
import type { CollectionType } from "@/types/collection";

const mocks = vi.hoisted(() => ({ cloud: vi.fn(), playlist: vi.fn(), error: vi.fn() }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({ removeCloudTracks: mocks.cloud }) }));
vi.mock("@/stores/playlist", () => ({
  usePlaylistStore: () => ({ removeTracks: mocks.playlist }),
}));
vi.mock("@/stores/library", () => ({ useLibraryStore: () => ({}) }));
vi.mock("@/composables/useToast", () => ({ toast: { error: mocks.error } }));
vi.mock("@/composables/useDownload", () => ({ useDownload: () => ({ enqueueMany: vi.fn() }) }));
vi.mock("@/core/player", () => ({}));

import { useMultiSelect } from "./useMultiSelect";

const track: Track = {
  id: "20",
  cloudId: "1000",
  source: "netease",
  title: "歌曲",
  artists: [],
  duration: 1000,
};

describe("云盘删除身份与原有歌单删除隔离", () => {
  it.each(["1000", undefined])("云盘删除使用条目身份 %s，旧缓存兼容播放 ID", async (cloudId) => {
    const item = { ...track, cloudId };
    const changed = vi.fn();
    const batch = useMultiSelect(shallowRef([item]), {
      source: ref("netease"),
      collectionType: ref<CollectionType>("cloud"),
      collectionId: ref(undefined),
      onChanged: changed,
    });
    batch.requestDelete([item], "cloud");
    await batch.confirmDelete();
    expect(mocks.cloud).toHaveBeenCalledExactlyOnceWith([cloudId ?? "20"]);
    expect(changed).toHaveBeenCalledWith(["20"]);
    expect(mocks.playlist).not.toHaveBeenCalled();
  });

  it("匹配到同一歌曲的两个云盘条目拥有独立虚拟列表键和多选状态", () => {
    const other = { ...track, cloudId: "1001" };
    const batch = useMultiSelect(shallowRef([track, other]), {
      source: ref("netease"),
      collectionType: ref<CollectionType>("cloud"),
      collectionId: ref(undefined),
    });
    expect(batch.getItemKey(track)).toBe("1000");
    expect(batch.getItemKey(other)).toBe("1001");
    batch.toggle(batch.getItemKey(track));
    expect(batch.selectedItems.value).toEqual([track]);
    expect(batch.selectedCount.value).toBe(1);
    expect(batch.isAllSelected.value).toBe(false);
    batch.invertSelection();
    expect(batch.selectedItems.value).toEqual([other]);
    batch.selectAll();
    expect(batch.selectedCount.value).toBe(2);
    expect(batch.isAllSelected.value).toBe(true);
  });

  it("普通歌单删除仍使用播放 ID，不误用云盘条目 ID", async () => {
    const batch = useMultiSelect(shallowRef([track]), {
      source: ref("local"),
      collectionType: ref<CollectionType>("playlist"),
      collectionId: ref("list"),
    });
    expect(batch.getItemKey(track)).toBe("20");
    batch.requestDelete([track], "remove");
    await batch.confirmDelete();
    expect(mocks.playlist).toHaveBeenCalledExactlyOnceWith("list", ["20"]);
    expect(mocks.cloud).not.toHaveBeenCalled();
  });
});
