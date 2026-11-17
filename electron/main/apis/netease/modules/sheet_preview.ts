import { createOption } from "../core/option";
import type { NeteaseModule } from "../core/types";

/**
 * 获取指定乐谱的可预览页面
 * @param query - 包含乐谱 id 的请求参数
 * @param request - 共用请求方法
 * @returns 服务端允许预览的图片，不绕过访问权限
 */
const sheet_preview: NeteaseModule = (query, request) =>
  request("/api/music/sheet/preview/info", { id: query.id }, createOption(query));

export default sheet_preview;
