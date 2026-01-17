import { parseArgs, getString } from "../utils/parseArgs.js";

/**
 * start_bugfix 智能编排工具
 * 
 * 场景：修复 Bug
 * 编排：[检查上下文] → fix_bug → gentest
 */

const PROMPT_TEMPLATE = `# 🐛 Bug 修复编排指南

## 🎯 目标

修复以下 Bug：

**错误信息**:
\`\`\`
{error_message}
\`\`\`

{stack_trace_section}

---

## 📋 步骤 0: 项目上下文（自动处理）

**操作**:
1. 检查 \`docs/project-context.md\` 是否存在
2. **如果不存在**：
   - 调用 \`init_project_context\` 工具
   - 等待生成完成
3. **读取** \`docs/project-context.md\` 内容
4. 了解项目的技术栈、架构、测试框架
5. 后续步骤参考此上下文

---

## 🔍 步骤 1: Bug 分析与修复

**调用工具**: \`fix_bug\`

**参数**:
\`\`\`json
{
  "error_message": "{error_message}",
  "stack_trace": "{stack_trace}"
}
\`\`\`

**执行要点**:
1. 按指南完成问题定位
2. 使用 5 Whys 分析根本原因
3. 设计修复方案
4. 实施代码修复

**产出**: 修复后的代码

---

## 🧪 步骤 2: 生成回归测试

**调用工具**: \`gentest\`

**参数**:
\`\`\`json
{
  "code": "[修复后的代码]",
  "framework": "[根据项目上下文选择: jest/vitest/mocha]"
}
\`\`\`

**执行要点**:
1. 为修复的代码生成测试
2. 包含 Bug 场景的测试用例
3. 包含边界情况测试

**产出**: 测试代码

---

## ✅ 完成检查

- [ ] 项目上下文已读取
- [ ] Bug 已定位
- [ ] 根本原因已分析
- [ ] 代码已修复
- [ ] 测试已添加
- [ ] 测试已通过

---

## 📝 输出汇总

完成后，向用户汇总：

1. **Bug 原因**: [根本原因]
2. **修复方案**: [修复说明]
3. **修改文件**: [文件列表]
4. **测试覆盖**: [测试情况]

---

*编排工具: MCP Probe Kit - start_bugfix*
`;

export async function startBugfix(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      error_message?: string;
      stack_trace?: string;
    }>(args, {
      defaultValues: {
        error_message: "",
        stack_trace: "",
      },
      primaryField: "error_message", // 纯文本输入默认映射到 error_message 字段
      fieldAliases: {
        error_message: ["error", "err", "message", "错误", "错误信息"],
        stack_trace: ["stack", "trace", "堆栈", "调用栈"],
      },
    });

    const errorMessage = getString(parsedArgs.error_message);
    const stackTrace = getString(parsedArgs.stack_trace);

    if (!errorMessage) {
      throw new Error("缺少必填参数: error_message（错误信息）");
    }

    const stackTraceSection = stackTrace
      ? `**堆栈跟踪**:\n\`\`\`\n${stackTrace}\n\`\`\``
      : "";

    const guide = PROMPT_TEMPLATE
      .replace(/{error_message}/g, errorMessage)
      .replace(/{stack_trace}/g, stackTrace)
      .replace(/{stack_trace_section}/g, stackTraceSection);

    return {
      content: [{ type: "text", text: guide }],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ 编排执行失败: ${errorMsg}` }],
      isError: true,
    };
  }
}
