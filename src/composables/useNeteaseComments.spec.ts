import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, reactive, shallowRef } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type {
  MusicCommentItem,
  NeteaseCommentPage,
  NeteaseCommentQuery,
  NeteaseCommentTarget,
} from "@shared/types/comment";
import { useNeteaseComments } from "./useNeteaseComments";

const mocks = vi.hoisted(() => ({
  user: {} as { profile: { userId: number } | null; isLoggedIn: boolean },
  read: vi.fn(),
  like: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/stores/user", () => ({ useUserStore: () => mocks.user }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/composables/useToast", () => ({
  toast: { warning: mocks.warning, error: mocks.error },
}));
const item: MusicCommentItem = {
  id: "100",
  userName: "用户",
  text: "评论",
  liked: false,
  likedCount: 3,
};
/** 构造带会话身份和下一页游标的分页响应 */
const page = (query: NeteaseCommentQuery): NeteaseCommentPage => ({
  list: [{ ...item }],
  total: 60,
  page: query.page,
  limit: 20,
  hasMore: query.type === "new",
  nextCursor: String(1000 - query.page),
  session: 1,
});
const target = shallowRef<NeteaseCommentTarget | null>({ type: "song", id: "10" });
let wrapper: VueWrapper;
let state: ReturnType<typeof useNeteaseComments>;
/** 在真实生命周期中挂载当前页评论状态 */
const start = (): void => {
  wrapper = mount(
    defineComponent({
      setup() {
        state = useNeteaseComments(target);
        return () => null;
      },
    }),
  );
};
/** 生成可控制完成时机的模拟请求 */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user = reactive({
    profile: { userId: 1 } as { userId: number } | null,
    get isLoggedIn() {
      return this.profile !== null;
    },
  });
  target.value = { type: "song", id: "10" };
  mocks.read.mockImplementation(async (q: NeteaseCommentQuery) => ({ ok: true, data: page(q) }));
  mocks.like.mockResolvedValue({ ok: true });
  Object.defineProperty(window, "api", {
    configurable: true,
    value: { comments: { resource: mocks.read, setLiked: mocks.like } },
  });
});
afterEach(() => wrapper?.unmount());

describe("网易云评论分页与生命周期", () => {
  it("只读取网易云资源方法，热门和全部独立加载，不请求评论源列表", async () => {
    start();
    await flushPromises();
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(state.hot.value).toHaveLength(1);
    expect(state.comments.value).toHaveLength(1);
    expect(state.total.value).toBe(60);
    expect(state.hotLoading.value || state.loading.value).toBe(false);
  });
  it("加载更多使用游标且在途去重，重复评论不追加", async () => {
    start();
    await flushPromises();
    const pending = deferred<{ ok: true; data: NeteaseCommentPage }>();
    mocks.read.mockReturnValueOnce(pending.promise);
    const loading = state.load("new");
    await state.load("new");
    expect(mocks.read).toHaveBeenLastCalledWith({
      target: target.value,
      type: "new",
      page: 2,
      cursor: "999",
    });
    pending.resolve({
      ok: true,
      data: {
        ...page({ target: target.value!, type: "new", page: 2 }),
        list: [item, { ...item, id: "101" }],
      },
    });
    await loading;
    expect(state.comments.value.map((c) => c.id)).toEqual(["100", "101"]);
  });
  it("失败不推进页码或游标，重试同一批次", async () => {
    start();
    await flushPromises();
    mocks.read.mockResolvedValueOnce({ ok: false, error: "offline" });
    await state.load("new");
    expect(state.error.value).toBe("offline");
    expect(state.comments.value).toHaveLength(1);
    await state.load("new");
    expect(mocks.read).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, cursor: "999" }),
    );
    expect(state.error.value).toBe("");
  });
  it("热门失败不阻止全部评论，空列表没有无限加载", async () => {
    mocks.read.mockImplementation(async (q: NeteaseCommentQuery) =>
      q.type === "hot"
        ? { ok: false, error: "hot failed" }
        : { ok: true, data: { ...page(q), list: [], total: 0, hasMore: false } },
    );
    start();
    await flushPromises();
    expect(state.hotError.value).toBe("hot failed");
    expect(state.error.value).toBe("");
    await state.load("new");
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
  it.each(["target", "account", "unmount"] as const)(
    "%s 后迟到分页和 finally 不能污染当前页",
    async (change) => {
      start();
      await flushPromises();
      const pending = deferred<{ ok: true; data: NeteaseCommentPage }>();
      mocks.read.mockReturnValueOnce(pending.promise);
      const loading = state.load("new");
      if (change === "target") target.value = { type: "album", id: "10" };
      if (change === "account") mocks.user.profile = { userId: 2 };
      if (change === "unmount") wrapper.unmount();
      await flushPromises();
      pending.resolve({
        ok: true,
        data: {
          ...page({ target: target.value!, type: "new", page: 2 }),
          list: [{ ...item, id: "old" }],
        },
      });
      await loading;
      expect(state.comments.value.some((c) => c.id === "old")).toBe(false);
    },
  );
  it("A→B→A 不接受第一次 A 的迟到结果", async () => {
    const pending = deferred<{ ok: true; data: NeteaseCommentPage }>();
    mocks.read.mockReturnValueOnce(pending.promise);
    start();
    target.value = { type: "song", id: "20" };
    target.value = { type: "song", id: "10" };
    await flushPromises();
    pending.resolve({
      ok: true,
      data: {
        ...page({ target: target.value!, type: "hot", page: 1 }),
        list: [{ ...item, id: "stale" }],
      },
    });
    await flushPromises();
    expect(state.hot.value[0].id).toBe("100");
  });
  it("长列表仅保留当前页最近 400 条，刷新清空裁剪标记", async () => {
    start();
    await flushPromises();
    mocks.read.mockImplementation(async (q: NeteaseCommentQuery) => ({
      ok: true,
      data: {
        ...page(q),
        list: Array.from({ length: 20 }, (_, n) => ({ ...item, id: String(q.page * 20 + n) })),
      },
    }));
    for (let n = 0; n < 22; n++) await state.load("new");
    expect(state.comments.value).toHaveLength(400);
    expect(state.trimmed.value).toBe(true);
    state.refresh();
    await flushPromises();
    expect(state.trimmed.value).toBe(false);
  });
  it("主进程会话续期后旧分页不追加，刷新后重新绑定新会话", async () => {
    start();
    await flushPromises();
    mocks.read.mockImplementation(async (q: NeteaseCommentQuery) => ({
      ok: true,
      data: { ...page(q), session: 2, list: [{ ...item, id: "new-session" }] },
    }));
    await state.load("new");
    expect(state.error.value).toBe("comments.sessionChanged");
    expect(state.comments.value[0].id).toBe("100");
    state.refresh();
    await flushPromises();
    await state.toggleLike(state.comments.value[0]);
    expect(mocks.like).toHaveBeenLastCalledWith(expect.objectContaining({ session: 2 }));
  });

  it("无效或空资源不发送请求", async () => {
    target.value = null;
    start();
    await flushPromises();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

describe("网易云评论点赞", () => {
  it("游客只提示登录，不写账号", async () => {
    mocks.user.profile = null;
    start();
    await flushPromises();
    await state.toggleLike(item);
    expect(mocks.warning).toHaveBeenCalledWith("comments.needLogin");
    expect(mocks.like).not.toHaveBeenCalled();
  });
  it("成功同步热门和全部的点赞状态与计数，再次点击可以取消", async () => {
    start();
    await flushPromises();
    await state.toggleLike(state.hot.value[0]);
    expect(mocks.like).toHaveBeenCalledExactlyOnceWith({
      target: target.value,
      commentId: "100",
      liked: true,
      session: 1,
    });
    expect(state.hot.value[0]).toMatchObject({ liked: true, likedCount: 4 });
    expect(state.comments.value[0]).toMatchObject({ liked: true, likedCount: 4 });
    await state.toggleLike(state.comments.value[0]);
    expect(state.hot.value[0]).toMatchObject({ liked: false, likedCount: 3 });
  });
  it("在途去重、失败不改计数且不自动重试", async () => {
    start();
    await flushPromises();
    const pending = deferred<{ ok: false; error: string }>();
    mocks.like.mockReturnValueOnce(pending.promise);
    const write = state.toggleLike(item);
    await state.toggleLike(item);
    expect(mocks.like).toHaveBeenCalledOnce();
    pending.resolve({ ok: false, error: "denied" });
    await write;
    expect(state.hot.value[0].likedCount).toBe(3);
    expect(mocks.error).toHaveBeenCalledWith("denied");
    expect(state.pendingLikes.value.size).toBe(0);
  });
  it("分页与账号写入互斥，避免迟到读取覆盖刚确认的点赞", async () => {
    start();
    await flushPromises();
    const pending = deferred<{ ok: true }>();
    mocks.like.mockReturnValueOnce(pending.promise);
    const write = state.toggleLike(item);
    const calls = mocks.read.mock.calls.length;
    await state.load("new");
    await state.load("hot");
    expect(mocks.read).toHaveBeenCalledTimes(calls);
    pending.resolve({ ok: true });
    await write;
    expect(state.comments.value[0].liked).toBe(true);
  });

  it("卸载后的写入失败不留下通知或订阅", async () => {
    start();
    await flushPromises();
    const pending = deferred<{ ok: false; error: string }>();
    mocks.like.mockReturnValueOnce(pending.promise);
    const write = state.toggleLike(item);
    wrapper.unmount();
    pending.resolve({ ok: false, error: "late failure" });
    await write;
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("写入期间换账号后，不更新新账号计数或显示旧提示", async () => {
    start();
    await flushPromises();
    const pending = deferred<{ ok: true }>();
    mocks.like.mockReturnValueOnce(pending.promise);
    const write = state.toggleLike(item);
    mocks.user.profile = { userId: 2 };
    await flushPromises();
    pending.resolve({ ok: true });
    await write;
    expect(state.comments.value[0]).toMatchObject({ liked: false, likedCount: 3 });
    expect(mocks.error).not.toHaveBeenCalled();
  });
});
