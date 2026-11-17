import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../core/option", () => ({ createOption: () => ({ crypto: "", cookie: "session" }) }));

import summary from "./song_wiki_summary";
import story from "./music_first_listen_info";
import sheets from "./sheet_list";
import preview from "./sheet_preview";

const request = vi.fn();
const response = { status: 200, body: { code: 200, data: {} }, cookie: [] };

beforeEach(() => request.mockReset().mockResolvedValue(response));

describe("百科接口复用公共请求层", () => {
  it.each([
    [summary, "/api/song/play/about/block/page", { songId: "9007199254740993" }],
    [story, "/api/content/activity/music/first/listen/info", { songId: "9007199254740993" }],
    [sheets, "/api/music/sheet/list/v1", { id: "9007199254740993", abTest: "b" }],
    [preview, "/api/music/sheet/preview/info", { id: "9007199254740993" }],
  ] as const)("%s 使用正确路径与参数，不转换字符串 ID", async (module, path, data) => {
    expect(await module({ id: "9007199254740993" }, request)).toBe(response);
    expect(request).toHaveBeenCalledExactlyOnceWith(path, data, { crypto: "", cookie: "session" });
  });

  it.each([summary, story, sheets, preview])("接口失败原样返回，不自行重试", async (module) => {
    const error = new Error("network");
    request.mockRejectedValueOnce(error);
    await expect(module({ id: "1" }, request)).rejects.toBe(error);
    expect(request).toHaveBeenCalledOnce();
  });
});
