import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WikiSummary } from "@/types/wiki";

const call = vi.hoisted(() => vi.fn());
vi.mock("@/apis/netease", () => ({ neteaseCall: call }));
import {
  getWikiTrack,
  getWikiSummary,
  getWikiStory,
  getWikiSheets,
  getWikiSheetPreview,
  normalizeSongWiki,
} from "./wiki";

beforeEach(() => call.mockReset());

describe("歌曲百科数据", () => {
  it("歌曲信息复用 Track 转换，发行日期不塞入队列类型", async () => {
    call.mockResolvedValue({
      code: 200,
      songs: [{ id: 10, name: "歌曲", ar: [], publishTime: 1234 }],
    });
    const detail = await getWikiTrack("10");
    expect(call).toHaveBeenCalledWith("song_detail", { ids: "10" });
    expect(detail.track).toMatchObject({ id: "10", title: "歌曲", source: "netease" });
    expect(detail.publishTime).toBe(1234);
    call.mockResolvedValue({ code: 200, songs: [] });
    expect((await getWikiTrack("10")).track).toBeNull();
  });

  it.each([true, false])("百科兼容正文包装层 data=%s", async (wrapped) => {
    const value = { blocks: [{ code: "SONG_PLAY_ABOUT_SONG_BASIC" }] };
    call.mockResolvedValue({ code: 200, ...(wrapped ? { data: value } : value) });
    expect((await getWikiSummary("10")).blocks).toEqual(value.blocks);
    expect(call).toHaveBeenCalledWith("song_wiki_summary", { id: "10" });
  });

  it.each([0, 1, 2])("音乐故事兼容 %s 层 data", async (layers) => {
    const story = { musicTotalPlayDto: { playCount: 0, text: "收听记录" } };
    let data: object = story;
    for (let i = 0; i < layers; i++) data = { data };
    call.mockResolvedValue({ code: 200, ...data });
    expect(await getWikiStory("10")).toMatchObject(story);
  });

  it("乐谱 ID 保持字符串精度", async () => {
    call.mockResolvedValue({
      code: 200,
      data: {
        musicSheetSimpleInfoVOS: [{ id: "9007199254740993", name: "乐谱", playVersion: "弹唱版" }],
      },
    });
    expect(await getWikiSheets("10")).toEqual([
      { id: "9007199254740993", name: "乐谱", playVersion: "弹唱版" },
    ]);
  });

  it.each(["array", "pageList", "pages"])("乐谱预览兼容 %s，过滤非图片协议", async (shape) => {
    const pages = [
      "https://img/1",
      { pageImageUrl: "http://img/2" },
      { url: "https://img/3" },
      "file:///private",
      "javascript:alert(1)",
      {},
    ];
    call.mockResolvedValue({ code: 200, data: shape === "array" ? pages : { [shape]: pages } });
    expect(await getWikiSheetPreview("9007199254740993")).toEqual([
      "https://img/1",
      "http://img/2",
      "https://img/3",
    ]);
    expect(call).toHaveBeenCalledWith("sheet_preview", { id: "9007199254740993" });
  });

  it.each([getWikiTrack, getWikiSummary, getWikiStory, getWikiSheets, getWikiSheetPreview])(
    "业务失败不可伪装为空内容",
    async (getData) => {
      call.mockResolvedValue({ code: 500, message: "不可用" });
      await expect(getData("10")).rejects.toThrow("不可用");
    },
  );

  it("按旧版区分故事、曲风、语种、节奏、成就与相似歌曲，忽略未知块", () => {
    const summary: WikiSummary = {
      musicTotalPlayDto: { playCount: 8 },
      blocks: [
        {
          code: "unknown",
          creatives: [
            {
              creativeType: "language",
              uiElement: { mainTitle: { title: "忽略" }, textLinks: [{ text: "忽略" }] },
            },
          ],
        },
        {
          code: "SONG_PLAY_ABOUT_SONG_BASIC",
          creatives: [
            {
              creativeType: "songTag",
              uiElement: { mainTitle: { title: "曲风" } },
              resources: [{ uiElement: { mainTitle: { title: "流行" } } }, {}],
            },
            {
              creativeType: "language",
              uiElement: { mainTitle: { title: "语种" }, textLinks: [{ text: "国语" }] },
            },
            {
              creativeType: "bpm",
              uiElement: { mainTitle: { title: "BPM" }, textLinks: [{ text: "120" }] },
            },
            {
              creativeType: "songAward",
              resources: [
                {
                  uiElement: {
                    mainTitle: { title: "奖项" },
                    subTitles: [{ title: "2024" }],
                    images: [{ imageUrl: "https://img/award" }],
                  },
                },
              ],
            },
            {
              creativeType: "entertainment",
              resources: [{ uiElement: { mainTitle: { title: "影视" } } }],
            },
            {},
          ],
        },
        {
          code: "SONG_PLAY_ABOUT_SIMILAR_SONG",
          creatives: [
            {
              resources: [
                { resourceId: "9007199254740993" },
                { resourceId: "9007199254740993" },
                { resourceId: 12 },
                { resourceId: "bad" },
                {},
              ],
            },
          ],
        },
      ],
    };
    const model = normalizeSongWiki(summary, { musicTotalPlayDto: { playCount: 0 } });
    expect(model.story.musicTotalPlayDto?.playCount).toBe(0);
    expect(model.basicInfo).toEqual([
      { label: "曲风", tags: ["流行"] },
      { label: "语种", value: "国语" },
      { label: "BPM", value: "120" },
    ]);
    expect(model.awards).toEqual([
      { title: "奖项", subTitle: "2024", image: "https://img/award?param=300y300" },
    ]);
    expect(model.credentials).toEqual([{ title: "影视", subTitle: "", image: undefined }]);
    expect(model.similarIds).toEqual(["9007199254740993", "12"]);
    expect(normalizeSongWiki({}, {}).basicInfo).toEqual([]);
  });
});
