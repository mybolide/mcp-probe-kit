/**
 * start_review 智能编排工具
 * 
 * 场景：代码体检
 * 编排：[检查上下文] → code_review → security_scan → perf
 */

const PROMPT_TEMPLATE = `# 🔍 代码体检编排指南

## 🎯 目标

对以下代码进行全面体检：

\`\`\`{language}
{code}
\`\`\`

---

## 📋 步骤 0: 项目上下文（自动处理）

**操作**:
1. 检查 \`docs/project-context.md\` 是否存在
2. **如果不存在**：
   - 调用 \`init_project_context\` 工具
   - 等待生成完成
3. **读取** \`docs/project-context.md\` 内容
4. 了解项目的编码规范、技术栈
5. 后续审查要参考项目规范

---

## 📝 步骤 1: 代码质量审查

**调用工具**: \`code_review\`

**参数**:
\`\`\`json
{
  "code": "[待审查代码]",
  "focus": "quality"
}
\`\`\`

**审查要点**:
- 代码可读性
- 命名规范
- 代码结构
- 最佳实践
- 潜在 Bug

**产出**: 质量问题清单

---

## 🔒 步骤 2: 安全漏洞扫描

**调用工具**: \`security_scan\`

**参数**:
\`\`\`json
{
  "code": "[待审查代码]",
  "scan_type": "all"
}
\`\`\`

**扫描要点**:
- 注入漏洞（SQL/XSS/命令注入）
- 认证授权问题
- 加密安全
- 敏感数据泄露

**产出**: 安全漏洞报告

---

## ⚡ 步骤 3: 性能分析

**调用工具**: \`perf\`

**参数**:
\`\`\`json
{
  "code": "[待审查代码]",
  "type": "all"
}
\`\`\`

**分析要点**:
- 算法复杂度
- 内存使用
- 数据库查询
- 渲染性能（如适用）

**产出**: 性能优化建议

---

## ✅ 完成检查

- [ ] 项目上下文已读取
- [ ] 代码质量已审查
- [ ] 安全漏洞已扫描
- [ ] 性能已分析

---

## 📊 综合报告模板

完成后，生成综合报告：

### 代码体检报告

#### 📈 总体评分

| 维度 | 评分 | 问题数 |
|------|------|--------|
| 代码质量 | ?/10 | X 个 |
| 安全性 | ?/10 | X 个 |
| 性能 | ?/10 | X 个 |
| **综合** | ?/10 | |

#### 🔴 严重问题（需立即修复）
[列出严重问题]

#### 🟡 一般问题（建议修复）
[列出一般问题]

#### 🟢 优化建议
[列出优化建议]

#### 📋 修复优先级
1. [最高优先级问题]
2. [次优先级问题]
...

---

*编排工具: MCP Probe Kit - start_review*
`;

export async function startReview(args: any) {
  try {
    const code = args?.code;

    if (!code) {
      throw new Error("缺少必填参数: code（需要审查的代码）");
    }

    const language = args?.language || "auto";

    const guide = PROMPT_TEMPLATE
      .replace(/{code}/g, code)
      .replace(/{language}/g, language);

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
