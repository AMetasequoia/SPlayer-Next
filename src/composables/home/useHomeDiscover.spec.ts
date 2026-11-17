import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, type EffectScope } from "vue";
import type { CoverItem } from "@/types/artist";

const mocks = vi.hoisted(() => ({
  user: {} as { profile: { userId: number } | null; isLoggedIn: boolean },
  recommend: vi.fn(),
  radar: vi.fn(),
  artists: vi.fn(),
  albums: vi.fn(),
}));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/stores/user", () => ({ useUserStore: () => mocks.user }));
vi.mock("@/apis/recommend/netease", () => ({
  fetchRecommendPlaylists: mocks.recommend,
  fetchRadarPlaylists: mocks.radar,
  fetchArtists: mocks.artists,
  fetchNewAlbums: mocks.albums,
}));

let scope: EffectScope;
const item: CoverItem = { id: "list", title: "推荐", cover: "cover.jpg", trackCount: 1 };

beforeEach(() => {
  vi.resetModules();
  mocks.user = reactive({
    profile: { userId: 1 } as { userId: number } | null,
    get isLoggedIn() {
      return this.profile !== null;
    },
  });
  mocks.recommend.mockReset().mockResolvedValue([item]);
  mocks.radar.mockReset().mockResolvedValue([item]);
  scope = effectScope();
});

afterEach(() => scope.stop());

describe("首页精简后的推荐加载", () => {
  it("仅请求歌单与雷达，不再请求或缓存歌手和新碟", async () => {
    const { useHomeDiscover } = await import("./useHomeDiscover");
    const home = scope.run(useHomeDiscover)!;
    await home.load();
    expect(home.recommendPlaylists.value).toEqual([item]);
    expect(home.radarPlaylists.value).toEqual([item]);
    expect(mocks.recommend).toHaveBeenCalledExactlyOnceWith(true);
    expect(mocks.radar).toHaveBeenCalledOnce();
    expect(mocks.artists).not.toHaveBeenCalled();
    expect(mocks.albums).not.toHaveBeenCalled();
    expect(home).not.toHaveProperty("artists");
    expect(home).not.toHaveProperty("newAlbums");
    await home.load();
    expect(mocks.recommend).toHaveBeenCalledOnce();
  });

  it("游客仍有公共歌单，不请求登录专属雷达", async () => {
    mocks.user.profile = null;
    const { useHomeDiscover } = await import("./useHomeDiscover");
    const home = scope.run(useHomeDiscover)!;
    await home.load();
    expect(mocks.recommend).toHaveBeenCalledExactlyOnceWith(false);
    expect(mocks.radar).not.toHaveBeenCalled();
    expect(home.recommendTitle.value).toBe("home.recommend.titleGuest");
  });

  it("切换账号清空旧推荐，旧响应不能覆盖新账号或缓存", async () => {
    let finish!: (items: CoverItem[]) => void;
    mocks.recommend.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { useHomeDiscover } = await import("./useHomeDiscover");
    const home = scope.run(useHomeDiscover)!;
    const oldLoad = home.load();
    mocks.user.profile = { userId: 2 };
    await nextTick();
    await vi.waitFor(() => expect(home.recommendPlaylists.value).toEqual([item]));
    finish([{ ...item, id: "old" }]);
    await oldLoad;
    expect(home.recommendPlaylists.value).toEqual([item]);
    await home.load();
    expect(home.recommendPlaylists.value).toEqual([item]);
  });

  it("单区块失败不影响其他区块", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.radar.mockRejectedValueOnce(new Error("network"));
    const { useHomeDiscover } = await import("./useHomeDiscover");
    const home = scope.run(useHomeDiscover)!;
    await home.load();
    expect(home.recommendPlaylists.value).toEqual([item]);
    expect(home.radarPlaylists.value).toEqual([]);
  });

  it("卸载后迟到的请求不会发布推荐或写入跨页面缓存", async () => {
    let finish!: (items: CoverItem[]) => void;
    mocks.recommend.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { useHomeDiscover } = await import("./useHomeDiscover");
    const home = scope.run(useHomeDiscover)!;
    const loading = home.load();
    scope.stop();
    finish([{ ...item, id: "disposed" }]);
    await loading;
    expect(home.recommendPlaylists.value).toEqual([]);
    scope = effectScope();
    const next = scope.run(useHomeDiscover)!;
    await next.load();
    expect(next.recommendPlaylists.value).toEqual([item]);
    expect(mocks.recommend).toHaveBeenCalledTimes(2);
  });
});
