/** 网易云百科展示元素 */
export interface WikiElement {
  mainTitle?: { title?: string };
  subTitles?: { title?: string }[];
  textLinks?: { text?: string }[];
  images?: { imageUrl?: string }[];
}

/** 账号相关的音乐故事 */
export interface WikiStory {
  musicFirstListenDto?: {
    season?: string;
    period?: string;
    date?: string;
    listenTime?: number;
    meetDurationDesc?: string;
  };
  musicTotalPlayDto?: { playCount?: number; text?: string };
  musicLikeSongDto?: { like?: boolean; text?: string; redDesc?: string };
}

/** 歌曲百科正文 */
export interface WikiSummary extends WikiStory {
  blocks?: {
    code?: string;
    creatives?: {
      creativeType?: string;
      uiElement?: WikiElement;
      resources?: { resourceId?: string | number; uiElement?: WikiElement }[];
    }[];
  }[];
}

/** 乐谱列表摘要，ID 始终保存为字符串 */
export interface WikiSheet {
  id: string;
  name: string;
  playVersion?: string;
}

/** 归一化的百科信息 */
export interface SongWiki {
  story: WikiStory;
  basicInfo: { label: string; value?: string; tags?: string[] }[];
  awards: { title: string; subTitle: string; image?: string }[];
  credentials: { title: string; subTitle: string; image?: string }[];
  similarIds: string[];
}

/** 单份乐谱的页面内加载状态 */
export interface WikiSheetState extends WikiSheet {
  images: string[];
  loading: boolean;
  loaded: boolean;
  error: boolean;
}
