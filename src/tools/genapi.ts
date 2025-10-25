// genapi 工具实现
export async function genapi(args: any) {
  try {
    const code = args?.code || "";
    const format = args?.format || "markdown"; // markdown, openapi, jsdoc

    const message = `请为以下代码生成 API 文档：

📝 **代码**：
${code || "请提供需要生成文档的代码（函数、类、API 端点等）"}

📖 **文档格式**：${format}

---

🎯 **API 文档生成指南**：

**基础信息**：
- API 名称和描述
- 版本信息
- 基础 URL

**详细文档**（每个端点/函数）：

1. **功能描述**
   - 简短说明（一句话）
   - 详细描述（用途、场景）

2. **请求参数**
   | 参数名 | 类型 | 必填 | 描述 | 示例 |
   |--------|------|------|------|------|
   | id | string | 是 | 用户 ID | "12345" |
   | name | string | 否 | 用户名 | "张三" |

3. **返回值**
   - 成功响应（状态码、数据结构、示例）
   - 错误响应（错误码、错误信息）

4. **示例代码**
   \`\`\`typescript
   // 请求示例
   const response = await fetch('/api/users/123');
   const data = await response.json();
   
   // 响应示例
   {
     "code": 200,
     "data": {
       "id": "123",
       "name": "张三"
     }
   }
   \`\`\`

5. **注意事项**
   - 权限要求
   - 速率限制
   - 废弃信息
   - 相关链接

---

**Markdown 格式模板**：
\`\`\`markdown
# API 文档

## 用户管理

### 获取用户信息

**接口地址**：\`GET /api/users/:id\`

**功能描述**：根据用户 ID 获取用户详细信息

**请求参数**：
| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| id | string | 是 | 用户 ID |

**返回示例**：
\`\`\`json
{
  "code": 200,
  "data": {
    "id": "123",
    "name": "张三",
    "email": "zhangsan@example.com"
  }
}
\`\`\`

**错误码**：
- 404: 用户不存在
- 403: 无权限访问
\`\`\`

---

**OpenAPI 3.0 格式模板**：
\`\`\`yaml
openapi: 3.0.0
info:
  title: User API
  version: 1.0.0
paths:
  /api/users/{id}:
    get:
      summary: 获取用户信息
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: 成功
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                  data:
                    type: object
\`\`\`

---

现在请根据上述代码生成完整的 API 文档，并将文档保存到项目的 \`docs/api/\` 目录。`;

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
          text: `❌ 生成 API 文档失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

