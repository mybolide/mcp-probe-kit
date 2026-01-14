/**
 * gen_mock 工具
 * 
 * 功能：根据数据结构生成 Mock 数据
 * 模式：指令生成器模式 - 返回生成指南，由 AI 执行实际生成
 */

const PROMPT_TEMPLATE = `# Mock 数据生成指南

## 🎯 生成目标

**数据结构**:
\`\`\`
{schema}
\`\`\`

**生成配置**:
- 数量: {count} 条
- 格式: {format}
- 语言: {locale}
{seed_section}

---

## 📋 生成步骤

### 步骤 1: 解析数据结构

分析输入的数据结构，识别：
1. 字段名称和类型
2. 必填/可选字段（?标记）
3. 嵌套结构
4. 数组类型

### 步骤 2: 字段语义识别

根据字段名自动匹配语义，生成符合语义的数据：

| 字段名模式 | 生成规则 | 中文示例 | 英文示例 |
|------------|----------|----------|----------|
| id, _id | UUID/自增ID | uuid-xxx | uuid-xxx |
| name, 姓名 | 人名 | 张三、李四 | John Doe |
| email, 邮箱 | 邮箱格式 | zhangsan@example.com | john@example.com |
| phone, mobile, 手机 | 手机号 | 138xxxx1234 | +1-xxx-xxx-xxxx |
| avatar, 头像 | 图片URL | https://api.dicebear.com/... | |
| address, 地址 | 地址 | 北京市朝阳区xxx | 123 Main St |
| city, 城市 | 城市名 | 北京、上海 | New York |
| country, 国家 | 国家名 | 中国 | United States |
| date, 日期 | 日期 | 2024-01-15 | 2024-01-15 |
| createdAt, created_at | 过去时间 | 2024-01-01T10:00:00Z | |
| updatedAt, updated_at | 最近时间 | 2024-01-15T15:30:00Z | |
| title, 标题 | 短句 | 这是一个标题 | A Sample Title |
| description, desc, 描述 | 段落 | 这是描述内容... | Lorem ipsum... |
| content, 内容 | 长文本 | 文章内容... | Article content... |
| price, 价格 | 金额 | 99.00 | 99.00 |
| amount, 数量 | 整数 | 10 | 10 |
| status, 状态 | 枚举 | active/inactive | active/inactive |
| type, 类型 | 枚举 | 根据上下文 | |
| url, 链接 | URL | https://example.com | |
| image, 图片 | 图片URL | https://picsum.photos/... | |
| age, 年龄 | 18-60 | 25 | 25 |
| gender, 性别 | 性别 | 男/女 | male/female |
| username, 用户名 | 用户名 | user_123 | user_123 |
| password, 密码 | 密码占位 | ******** | ******** |
| token | Token | tok_xxx | tok_xxx |
| code, 编码 | 编码 | CODE001 | CODE001 |
| sort, order, 排序 | 序号 | 1, 2, 3 | 1, 2, 3 |
| enabled, active | 布尔 | true/false | true/false |
| tags, 标签 | 标签数组 | ["标签1", "标签2"] | ["tag1", "tag2"] |

### 步骤 3: 类型映射

基础类型的默认生成规则：

| 类型 | 生成规则 |
|------|----------|
| string | 根据字段名语义，或随机字符串 |
| number | 1-100 的随机整数 |
| boolean | true/false 随机 |
| Date | 最近30天内的随机时间 |
| string[] | 3-5个随机字符串 |
| number[] | 3-5个随机数字 |
| enum | 从枚举值中随机选择 |
| union | 从联合类型中随机选择 |

### 步骤 4: 生成数据

根据识别结果生成 {count} 条数据。

**注意事项**:
- 确保数据多样性，避免重复
- 数值类型保持合理范围
- 日期类型保持合理顺序（createdAt < updatedAt）
- 关联字段保持一致性

---

## 📊 输出格式

### JSON 格式
\`\`\`json
[
  {
    "field1": "value1",
    "field2": 123
  }
]
\`\`\`

### TypeScript 格式
\`\`\`typescript
const mockData: YourType[] = [
  {
    field1: "value1",
    field2: 123
  }
];

export default mockData;
\`\`\`

### JavaScript 格式
\`\`\`javascript
const mockData = [
  {
    field1: "value1",
    field2: 123
  }
];

module.exports = mockData;
\`\`\`

### CSV 格式（仅扁平数据）
\`\`\`csv
field1,field2
value1,123
\`\`\`

---

## 🔧 高级功能

### 自定义规则

在 schema 注释中指定规则：

\`\`\`typescript
interface User {
  id: string;           // UUID
  age: number;          // range: 18-60
  status: string;       // enum: active, inactive, pending
  score: number;        // range: 0-100, decimal: 2
  tags: string[];       // count: 3-5
  level: number;        // enum: 1, 2, 3
}
\`\`\`

### 关联数据

生成有关联关系的数据：

\`\`\`json
// 先生成 users
[
  { "id": "user-1", "name": "张三" },
  { "id": "user-2", "name": "李四" }
]

// 再生成 orders，引用 user_id
[
  { "id": "order-1", "user_id": "user-1", "amount": 100 },
  { "id": "order-2", "user_id": "user-2", "amount": 200 }
]
\`\`\`

### 固定值

某些字段使用固定值：

\`\`\`typescript
interface Config {
  version: string;      // fixed: "1.0.0"
  env: string;          // fixed: "development"
}
\`\`\`

---

## ✅ 生成检查清单

- [ ] 数据结构已正确解析
- [ ] 字段语义已识别
- [ ] 数据类型正确
- [ ] 数量符合要求: {count} 条
- [ ] 格式正确: {format}
- [ ] 语言符合设置: {locale}
- [ ] 数据具有多样性
- [ ] 关联数据一致（如有）

---

*指南版本: 1.0.0*
*工具: MCP Probe Kit - gen_mock*
`;

/**
 * gen_mock 工具实现
 */
export async function genMock(args: any) {
  try {
    const schema = args?.schema;

    if (!schema) {
      throw new Error("缺少必填参数: schema（数据结构定义）");
    }

    const count = args?.count || 1;
    const format = args?.format || "json";
    const locale = args?.locale || "zh-CN";
    const seed = args?.seed;

    if (count < 1 || count > 1000) {
      throw new Error("count 参数必须在 1-1000 之间");
    }

    const formatMap: Record<string, string> = {
      json: "JSON",
      typescript: "TypeScript",
      javascript: "JavaScript",
      csv: "CSV",
    };

    const localeMap: Record<string, string> = {
      "zh-CN": "中文（简体）",
      "en-US": "英文（美国）",
      "ja-JP": "日文",
    };

    const seedSection = seed ? `- 随机种子: ${seed}（可重复生成）` : "";

    const guide = PROMPT_TEMPLATE
      .replace(/{schema}/g, schema)
      .replace(/{count}/g, String(count))
      .replace(/{format}/g, formatMap[format] || format)
      .replace(/{locale}/g, localeMap[locale] || locale)
      .replace(/{seed_section}/g, seedSection);

    return {
      content: [{ type: "text", text: guide }],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ Mock 数据生成失败: ${errorMsg}` }],
      isError: true,
    };
  }
}
