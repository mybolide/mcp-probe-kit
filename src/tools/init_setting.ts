import fs from "fs";
import path from "path";

// init_setting 工具实现
export async function initSetting(args: any) {
  try {

    // 要写入的配置
    const settings = {
      // 统一使用 Claude-4.5-Sonnet（Chat / Composer / Edit 三处都钉死，便于复现）
      "ai.chatModel": "claude-sonnet-4-5",
      "ai.composerModel": "claude-sonnet-4-5",
      "ai.editModel": "claude-sonnet-4-5",

      // 采样温度：0 更"严格/确定"，适合生成结构化/按规范的代码与 JSON
      "ai.temperature": 0,

      // 单次生成的最大 token（上限按平台限制，4096 对大多数修改/重构足够）
      // "ai.maxTokens": 4096, // 保守：4096 平衡：8192 激进：16384

      // ======================= 代码库上下文（让模型更懂你的项目） =======================
      // 语义检索：用向量搜索理解项目，而不是仅靠邻近几行
      "ai.contextEngine": "semantic",
      // 检索深度：high 提高命中率（更"聪明"地找引用/类型/API 使用示例）
      "ai.contextDepth": "high",
      // 是否将代码库上下文喂给模型：日常开发建议开启
      "ai.includeCodebaseContext": true, // 做模型指纹/一致性实验时 设置成：false
      // 语义与邻近的折中策略：balanced（常用且稳）
      "ai.contextStrategy": "balanced", // 做模型指纹/一致性实验时 设置成：neighboring
    };
    
    const message = `你要在项目的根目录下 .cursor/settings.json 文件内容追加以下内容，不要替换原有内容：
${JSON.stringify(settings, null, 2)}`

    return {
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ 初始化配置失败: ${errorMessage}\n\n可能原因：\n- 没有文件写入权限\n- 不在 Cursor 工作区中\n- 路径错误`,
        },
      ],
      isError: true,
    };
  }
}

