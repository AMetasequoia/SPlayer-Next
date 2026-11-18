import { ipcMain } from "electron";
import { getCommentSources, getMusicComments } from "@main/services/comments";
import { coreLog } from "@main/utils/logger";
import type {
  MusicCommentQuery,
  MusicCommentResponse,
  NeteaseCommentQuery,
  NeteaseCommentResponse,
  NeteaseCommentLikeQuery,
  CommentLikeResponse,
} from "@shared/types/comment";
import {
  getNeteaseResourceComments,
  setNeteaseCommentLiked,
} from "@main/services/comments/netease";

/** 注册评论 IPC */
export const registerCommentsIpc = (): void => {
  ipcMain.handle("comments:sources", () => getCommentSources());

  ipcMain.handle(
    "comments:resource",
    async (_evt, args: NeteaseCommentQuery): Promise<NeteaseCommentResponse> => {
      try {
        return { ok: true, data: await getNeteaseResourceComments(args) };
      } catch (err) {
        coreLog.warn("[comments] resource failed:", err);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  ipcMain.handle(
    "comments:setLiked",
    async (_evt, args: NeteaseCommentLikeQuery): Promise<CommentLikeResponse> => {
      try {
        await setNeteaseCommentLiked(args);
        return { ok: true };
      } catch (err) {
        coreLog.warn("[comments] like failed:", err);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  ipcMain.handle(
    "comments:get",
    async (_evt, args: MusicCommentQuery): Promise<MusicCommentResponse> => {
      try {
        return { ok: true, data: await getMusicComments(args) };
      } catch (err) {
        coreLog.warn("[comments] get failed:", err);
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
};
