import { parseArgs, getString } from "../utils/parseArgs.js";

/**
 * start_refactor 智能编排工具
 * 
 * 场景：代码重构
 * 编排：[检查上下文] → code_review → refactor → gentest
 */

const PROMPT_TEMPLATE = `# ♻️ 代码重构编排指南

## 🎯 目标

重构以下代码：

\`\`\`
{code}
\`\`\`

**重构目标**: {goal}

---

## 📋 步骤 0: 项目上下文（自动处理）

**操作**:
1. 检查 \`docs/project-context.md\` 是否存在
2. **如果不存在**：
   - 调用 \`init_project_context\` 工具
   - 等待生成完成
3. **读取** \`docs/project-context.md\` 内容
4. 了解项目的架构模式、编码规范
5. 重构要符合项目规范

---

## 🔍 步骤 1: 代码审查（发现问题）

**调用工具**: \`code_review\`

**参数**:
\`\`\`json
{
  "code": "[待重构代码]",
  "focus": "quality"
}
\`\`\`

**目的**:
- 识别代码坏味道
- 发现可改进点
- 评估当前代码质量

**产出**: 问题清单

---

## ♻️ 步骤 2: 生成重构方案

**调用工具**: \`refactor\`

**参数**:
\`\`\`json
{
  "code": "[待重构代码]",
  "goal": "{goal}"
}
\`\`\`

**重构方向**:
- improve_readability: 提高可读性
- reduce_complexity: 降低复杂度
- extract_function: 提取函数
- remove_duplication: 消除重复
- improve_naming: 改进命名

**产出**: 重构后的代码 + 重构说明

---

## 🧪 步骤 3: 生成保护测试

**调用工具**: \`gentest\`

**参数**:
\`\`\`json
{
  "code": "[重构后的代码]",
  "framework": "[根据项目上下文选择]"
}
\`\`\`

**目的**:
- 确保重构不改变行为
- 为重构后的代码提供测试保护
- 覆盖主要功能和边界情况

**产出**: 测试代码

---

## ✅ 完成检查

- [ ] 项目上下文已读取
- [ ] 代码问题已识别
- [ ] 重构方案已生成
- [ ] 代码已重构
- [ ] 测试已添加
- [ ] 测试已通过

---

## 📝 输出汇总

完成后，向用户提供：

### 1. 重构前后对比

**重构前**:
\`\`\`
[原代码]
\`\`\`

**重构后**:
\`\`\`
[新代码]
\`\`\`

### 2. 改进说明

| 改进项 | 说明 |
|--------|------|
| [改进1] | [说明] |
| [改进2] | [说明] |

### 3. 测试覆盖

- 测试用例数: X
- 覆盖场景: [列出]

### 4. 注意事项

- [重构可能影响的地方]
- [需要同步修改的地方]

---

*编排工具: MCP Probe Kit - start_refactor*
`;

export async function startRefactor(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      goal?: string;
    }>(args, {
      defaultValues: {
        code: "",
        goal: "improve_readability",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "src", "代码", "content"],
        goal: ["target", "objective", "目标", "重构目标"],
      },
    });

    const code = getString(parsedArgs.code);
    const goal = getString(parsedArgs.goal) || "improve_readability";

    if (!code) {
      throw new Error("缺少必填参数: code（需要重构的代码）");
    }

    const goalDesc: Record<string, string> = {
      improve_readability: "提高可读性",
      reduce_complexity: "降低复杂度",
      extract_function: "提取函数",
      remove_duplication: "消除重复",
      improve_naming: "改进命名",
    };

    const guide = PROMPT_TEMPLATE
      .replace(/{code}/g, code)
      .replace(/{goal}/g, goalDesc[goal] || goal);

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
