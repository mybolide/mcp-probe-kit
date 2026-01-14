/**
 * start_doc 智能编排工具
 * 
 * 场景：文档生成
 * 编排：[检查上下文] → gendoc → genreadme → genapi
 */

const PROMPT_TEMPLATE = `# 📖 文档生成编排指南

## 🎯 目标

为项目/代码生成完整的文档

**输入内容**:
\`\`\`
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
4. 了解项目的文档风格、技术栈

---

## 📝 步骤 1: 生成代码注释

**调用工具**: \`gendoc\`

**参数**:
\`\`\`json
{
  "code": "[代码内容]",
  "style": "{style}",
  "lang": "{lang}"
}
\`\`\`

**生成内容**:
- 函数/方法注释
- 参数说明
- 返回值说明
- 使用示例

**产出**: 带注释的代码

---

## 📄 步骤 2: 生成 README

**调用工具**: \`genreadme\`

**参数**:
\`\`\`json
{
  "project_info": "[项目信息或代码]",
  "style": "standard"
}
\`\`\`

**生成内容**:
- 项目简介
- 功能特性
- 安装使用
- API 说明
- 贡献指南

**产出**: README.md

---

## 🔌 步骤 3: 生成 API 文档（如适用）

**调用工具**: \`genapi\`

**参数**:
\`\`\`json
{
  "code": "[API 相关代码]",
  "format": "markdown"
}
\`\`\`

**生成内容**:
- API 端点列表
- 请求/响应格式
- 参数说明

**产出**: API 文档

---

## ✅ 完成检查

- [ ] 项目上下文已读取
- [ ] 代码注释已生成
- [ ] README 已生成
- [ ] API 文档已生成（如适用）

---

## 📊 输出汇总

完成后，向用户提供：

### 1. 代码注释

\`\`\`typescript
/**
 * [函数描述]
 * @param {Type} param - [参数说明]
 * @returns {Type} [返回值说明]
 * @example
 * [使用示例]
 */
\`\`\`

### 2. README.md

\`\`\`markdown
# 项目名称

## 简介
...

## 功能特性
...

## 快速开始
...

## API 文档
...

## 贡献指南
...

## 许可证
...
\`\`\`

### 3. API 文档（如适用）

\`\`\`markdown
## API 参考
...
\`\`\`

### 4. 文档清单

| 文档 | 状态 | 位置 |
|------|------|------|
| 代码注释 | ✅ | 源代码中 |
| README | ✅ | README.md |
| API 文档 | ✅/- | docs/api.md |

---

*编排工具: MCP Probe Kit - start_doc*
`;

export async function startDoc(args: any) {
  try {
    const code = args?.code || args?.project_info;

    if (!code) {
      throw new Error("缺少必填参数: code 或 project_info");
    }

    const style = args?.style || "jsdoc";
    const lang = args?.lang || "zh";

    const guide = PROMPT_TEMPLATE
      .replace(/{code}/g, code)
      .replace(/{style}/g, style)
      .replace(/{lang}/g, lang);

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
