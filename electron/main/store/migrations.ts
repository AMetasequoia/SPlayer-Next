import type { SystemConfig } from "@shared/types/settings";

export interface Migration {
  /** 版本号，递增整数 */
  version: number;
  /** 迁移函数，直接修改 data 对象 */
  migrate: (data: SystemConfig) => void;
}

/**
 * 迁移列表，按 version 递增排列
 * 新增字段已由 deepMerge 自动补全，此处仅用于字段重命名、数据转换等
 */
export const migrations: Migration[] = [
  {
    // Alpha 通道停发，原 Alpha 用户转到 Beta
    version: 1,
    migrate: (data) => {
      if ((data.update.channel as string) === "alpha") data.update.channel = "beta";
    },
  },
  {
    // 旧默认镜像改为留空，走 AMLL 官方 API；用户自定义的镜像保持不变
    version: 2,
    migrate: (data) => {
      if (data.lyric.amllDbServer === "https://amlldb.bikonoo.com/%p/%s.ttml") {
        data.lyric.amllDbServer = "";
      }
    },
  },
  {
    // 仅迁移旧默认退出键，保留自定义绑定和已有 Esc 用途
    version: 3,
    migrate: (data) => {
      const bindings = data.hotkeys.bindings;
      const closePlayer = bindings["view.closePlayer"];
      if (closePlayer.inApp !== "CommandOrControl+Escape") return;
      const escapeOccupied = Object.entries(bindings).some(
        ([id, binding]) => id !== "view.closePlayer" && binding.inApp === "Escape",
      );
      if (!escapeOccupied) closePlayer.inApp = "Escape";
    },
  },
];
