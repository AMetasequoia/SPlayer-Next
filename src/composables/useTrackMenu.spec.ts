import { describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import type { Track } from "@shared/types/player";
import type { CollectionType } from "@/types/collection";
import { useTrackMenu } from "./useTrackMenu";

vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/core/player", () => ({}));
vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({ system: { download: { enabled: false } } }),
}));
vi.mock("@/stores/plugins", () => ({ usePluginsStore: () => ({ menuContributions: [] }) }));
vi.mock("@/stores/status", () => ({ useStatusStore: () => ({}) }));
vi.mock("@/stores/download", () => ({ useDownloadStore: () => ({ isDownloaded: () => false }) }));
vi.mock("@/composables/useCopyText", () => ({ useCopyText: () => ({ copy: vi.fn() }) }));
vi.mock("@/composables/useDownload", () => ({ buildDownloadQualityItems: () => [] }));
vi.mock("@/composables/useToast", () => ({ toast: {} }));
vi.mock("@/utils/url", () => ({ openExternal: vi.fn() }));

const track: Track = {
  id: "10",
  cloudId: "1000",
  source: "netease",
  cloud: true,
  title: "云盘歌曲",
  artists: [],
  duration: 1000,
};

describe("云盘纠正菜单入口", () => {
  it("云盘歌曲提供纠正入口，选中后传递完整身份而不直接写入账号", async () => {
    const onMatchCloud = vi.fn();
    const menu = useTrackMenu(shallowRef(track), { collectionType: "cloud", onMatchCloud });

    expect(menu.items.value.find((item) => item.key === "matchCloud")?.show).toBe(true);
    await menu.handleSelect("matchCloud");
    expect(onMatchCloud).toHaveBeenCalledExactlyOnceWith(track);
  });

  it.each<{
    source: Track["source"];
    cloud: boolean;
    collectionType?: CollectionType;
    callback: boolean;
  }>([
    { source: "netease", cloud: true, collectionType: "playlist", callback: true },
    { source: "netease", cloud: false, collectionType: "cloud", callback: true },
    { source: "local", cloud: true, collectionType: "cloud", callback: true },
    { source: "qqmusic", cloud: true, collectionType: "cloud", callback: true },
    { source: "netease", cloud: true, collectionType: "cloud", callback: false },
    { source: "netease", cloud: true, callback: true },
  ])("不对不适用的歌曲或视图提供纠正入口：%j", ({ source, cloud, collectionType, callback }) => {
    const menu = useTrackMenu(shallowRef({ ...track, source, cloud }), {
      collectionType,
      onMatchCloud: callback ? vi.fn() : undefined,
    });

    expect(menu.items.value.find((item) => item.key === "matchCloud")?.show).toBe(false);
  });
});
