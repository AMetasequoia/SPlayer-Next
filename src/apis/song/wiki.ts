import { neteaseCall } from "@/apis/netease";
import type { Track } from "@shared/types/player";
import type { NeteaseSong } from "@shared/types/platform/netease";
import type { SongWiki, WikiSheet, WikiStory, WikiSummary } from "@/types/wiki";
import { ensureOk, songToTrack, withPicSize } from "@/utils/format/netease";

/**
 * 获取百科头部需要的歌曲信息，不把发行日期扩散到播放队列
 * @param id - 网易云歌曲 ID
 * @returns 轻量曲目与发行日期；歌曲不存在时曲目为 null
 */
export const getWikiTrack = async (
  id: string,
): Promise<{ track: Track | null; publishTime?: number }> => {
  const body = ensureOk(
    await neteaseCall<{ code: number; songs?: NeteaseSong[] }>("song_detail", { ids: id }),
  );
  const song = body.songs?.[0];
  return {
    track: song ? songToTrack(song) : null,
    publishTime: song?.publishTime ?? song?.al?.publishTime ?? song?.album?.publishTime,
  };
};

/**
 * 获取百科正文，业务错误不得伪装成空百科
 * @param id - 网易云播放歌曲 ID，不是云盘条目 ID
 * @returns 百科原始数据
 */
export const getWikiSummary = async (id: string): Promise<WikiSummary> => {
  const body = ensureOk(
    await neteaseCall<WikiSummary & { code: number; data?: WikiSummary }>("song_wiki_summary", {
      id,
    }),
  );
  return body.data ?? body;
};

/**
 * 获取当前账号的音乐故事
 * @param id - 网易云歌曲 ID
 * @returns 个人收听记录
 */
export const getWikiStory = async (id: string): Promise<WikiStory> => {
  const body = ensureOk(
    await neteaseCall<WikiStory & { code: number; data?: WikiStory & { data?: WikiStory } }>(
      "music_first_listen_info",
      { id },
    ),
  );
  return body.data?.data ?? body.data ?? body;
};

/**
 * 获取乐谱列表并保留 ID 精度
 * @param id - 网易云歌曲 ID
 * @returns 乐谱摘要列表
 */
export const getWikiSheets = async (id: string): Promise<WikiSheet[]> => {
  type SheetData = {
    musicSheetSimpleInfoVOS?: { id: string | number; name?: string; playVersion?: string }[];
  };
  const body = ensureOk(
    await neteaseCall<SheetData & { code: number; data?: SheetData }>("sheet_list", { id }),
  );
  return ((body.data ?? body).musicSheetSimpleInfoVOS ?? []).map((sheet) => ({
    id: String(sheet.id),
    name: sheet.name ?? "",
    playVersion: sheet.playVersion,
  }));
};

/**
 * 按需获取乐谱图片，只展示 HTTP(S) 图片
 * @param id - 乐谱 ID
 * @returns 图片地址列表
 */
export const getWikiSheetPreview = async (id: string): Promise<string[]> => {
  type Page = string | { pageImageUrl?: string; url?: string };
  type PreviewData = { pageList?: Page[]; pages?: Page[] };
  const body = ensureOk(
    await neteaseCall<
      PreviewData & {
        code: number;
        data?: Page[] | PreviewData;
      }
    >("sheet_preview", { id }),
  );
  const data = body.data ?? body;
  const pages = Array.isArray(data) ? data : (data?.pageList ?? data?.pages ?? []);
  return pages
    .map((page) => (typeof page === "string" ? page : (page.pageImageUrl ?? page.url ?? "")))
    .filter((url) => /^https?:\/\//i.test(url));
};

/**
 * 将百科块归一化为旧版页面的音乐故事、简介、成就与相似歌曲
 * @param summary - 百科正文
 * @param story - 独立接口返回的个人记录，优先于正文附带的记录
 * @returns 轻量展示模型，不保存原始响应
 */
export const normalizeSongWiki = (summary: WikiSummary, story: WikiStory): SongWiki => {
  const model: SongWiki = {
    story: {
      musicFirstListenDto: story.musicFirstListenDto ?? summary.musicFirstListenDto,
      musicTotalPlayDto: story.musicTotalPlayDto ?? summary.musicTotalPlayDto,
      musicLikeSongDto: story.musicLikeSongDto ?? summary.musicLikeSongDto,
    },
    basicInfo: [],
    awards: [],
    credentials: [],
    similarIds: [],
  };
  for (const block of summary.blocks ?? []) {
    for (const creative of block.creatives ?? []) {
      if (block.code === "SONG_PLAY_ABOUT_SIMILAR_SONG") {
        for (const resource of creative.resources ?? []) {
          const id = String(resource.resourceId ?? "");
          if (/^[1-9]\d*$/.test(id)) model.similarIds.push(id);
        }
        continue;
      }
      if (block.code !== "SONG_PLAY_ABOUT_SONG_BASIC") continue;
      const type = creative.creativeType;
      const label = creative.uiElement?.mainTitle?.title;
      if (type === "songAward" || type === "entertainment") {
        const items = (creative.resources ?? [])
          .map((resource) => ({
            title: resource.uiElement?.mainTitle?.title ?? "",
            image: withPicSize(resource.uiElement?.images?.[0]?.imageUrl),
            subTitle: (resource.uiElement?.subTitles ?? [])
              .map((sub) => sub.title)
              .filter(Boolean)
              .join(" / "),
          }))
          .filter((item) => item.title);
        (type === "songAward" ? model.awards : model.credentials).push(...items);
      } else if (label && (type === "songTag" || type === "songBizTag")) {
        const tags = (creative.resources ?? [])
          .map((resource) => resource.uiElement?.mainTitle?.title)
          .filter((tag): tag is string => !!tag);
        if (tags.length) model.basicInfo.push({ label, tags });
      } else if (label && (type === "language" || type === "bpm")) {
        const value = creative.uiElement?.textLinks?.[0]?.text;
        if (value) model.basicInfo.push({ label, value });
      }
    }
  }
  model.similarIds = [...new Set(model.similarIds)];
  return model;
};
