/**
 * start_api 智能编排工具
 * 
 * 场景：API 开发
 * 编排：[检查上下文] → genapi → gen_mock → gentest
 */

const PROMPT_TEMPLATE = `# 🔌 API 开发编排指南

## 🎯 目标

为以下 API 代码生成完整的开发资料：

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
4. 了解项目的 API 规范、测试框架

---

## 📝 步骤 1: 生成 API 文档

**调用工具**: \`genapi\`

**参数**:
\`\`\`json
{
  "code": "[API 代码]",
  "format": "{format}"
}
\`\`\`

**生成内容**:
- API 端点列表
- 请求/响应格式
- 参数说明
- 示例

**产出**: API 文档（Markdown/OpenAPI/JSDoc）

---

## 🎭 步骤 2: 生成 Mock 数据

**调用工具**: \`gen_mock\`

**参数**:
\`\`\`json
{
  "schema": "[从 API 代码中提取的数据结构]",
  "count": 5,
  "format": "json",
  "locale": "zh-CN"
}
\`\`\`

**生成内容**:
- 请求示例数据
- 响应示例数据
- 各种场景的测试数据

**产出**: Mock 数据文件

---

## 🧪 步骤 3: 生成 API 测试

**调用工具**: \`gentest\`

**参数**:
\`\`\`json
{
  "code": "[API 代码]",
  "framework": "[根据项目上下文选择]"
}
\`\`\`

**生成内容**:
- 单元测试
- 集成测试
- 边界情况测试
- 错误处理测试

**产出**: 测试代码

---

## ✅ 完成检查

- [ ] 项目上下文已读取
- [ ] API 文档已生成
- [ ] Mock 数据已生成
- [ ] 测试代码已生成

---

## 📊 输出汇总

完成后，向用户提供：

### 1. API 文档

\`\`\`markdown
## API 端点

### [METHOD] /path

**描述**: ...

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|

**响应**:
\`\`\`json
{
  "code": 0,
  "data": {}
}
\`\`\`
\`\`\`

### 2. Mock 数据

\`\`\`json
[Mock 数据示例]
\`\`\`

### 3. 测试代码

\`\`\`typescript
[测试代码]
\`\`\`

### 4. 使用建议

- Mock 数据可用于前端开发联调
- 测试代码可直接运行验证 API
- API 文档可分享给前端/调用方

---

*编排工具: MCP Probe Kit - start_api*
`;

export async function startApi(args: any) {
  try {
    const code = args?.code;

    if (!code) {
      throw new Error("缺少必填参数: code（API 代码）");
    }

    const language = args?.language || "typescript";
    const format = args?.format || "markdown";

    const guide = PROMPT_TEMPLATE
      .replace(/{code}/g, code)
      .replace(/{language}/g, language)
      .replace(/{format}/g, format);

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
