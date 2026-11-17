import { describe, expect, it } from "vitest";
import { defaultSystemConfig } from "@shared/defaults/settings";
import { migrations } from "./migrations";
import { deepMerge } from "./utils";

const migrate = migrations.find((migration) => migration.version === 3)!.migrate;

describe("播放界面 Esc 默认键迁移", () => {
  it("新配置默认使用 Esc，旧默认 Ctrl/Cmd+Esc 自动迁移", () => {
    expect(defaultSystemConfig.hotkeys.bindings["view.closePlayer"].inApp).toBe("Escape");
    const config = structuredClone(defaultSystemConfig);
    config.hotkeys.bindings["view.closePlayer"].inApp = "CommandOrControl+Escape";
    migrate(config);
    expect(config.hotkeys.bindings["view.closePlayer"]).toEqual({ inApp: "Escape", global: null });
  });

  it.each([null, "CommandOrControl+Q", "Shift+Escape"])("保留用户的 %s 绑定", (binding) => {
    const config = structuredClone(defaultSystemConfig);
    config.hotkeys.bindings["view.closePlayer"].inApp = binding;
    migrate(config);
    expect(config.hotkeys.bindings["view.closePlayer"].inApp).toBe(binding);
  });

  it("不覆盖已分配给其他动作的 Esc", () => {
    const config = structuredClone(defaultSystemConfig);
    config.hotkeys.bindings["view.closePlayer"].inApp = "CommandOrControl+Escape";
    config.hotkeys.bindings["view.togglePlaylist"].inApp = "Escape";
    migrate(config);
    expect(config.hotkeys.bindings["view.closePlayer"].inApp).toBe("CommandOrControl+Escape");
    expect(config.hotkeys.bindings["view.togglePlaylist"].inApp).toBe("Escape");
  });

  it("旧配置缺少暂停隐藏字段时自动补全，显式关闭的值保留", () => {
    expect(
      deepMerge(defaultSystemConfig, { dynamicIsland: { scale: 1.5 } }).dynamicIsland,
    ).toMatchObject({ scale: 1.5, hideWhenPaused: true });
    expect(
      deepMerge(defaultSystemConfig, { dynamicIsland: { hideWhenPaused: false } }).dynamicIsland
        .hideWhenPaused,
    ).toBe(false);
  });
});
