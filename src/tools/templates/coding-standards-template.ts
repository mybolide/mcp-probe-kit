/**
 * 编码规范模板
 * 用于生成 coding-standards.md（编码规范）
 */

export const codingStandardsTemplate = `# 编码规范

> 本文档描述 [项目名称] 的编码规范。

## 项目信息

| 属性 | 值 |
|------|-----|
| 项目名称 | [项目名称] |
| 版本 | [版本号] |

## 代码风格

| 工具 | 状态 | 配置文件 |
|------|------|----------|
| ESLint | [启用/未配置] | [配置文件路径] |
| Prettier | [启用/未配置] | [配置文件路径] |

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件命名 | [规范] | [示例] |
| 变量命名 | camelCase | userName |
| 常量命名 | UPPER_SNAKE_CASE | MAX_COUNT |
| 函数命名 | camelCase | getUserInfo |
| 类/接口命名 | PascalCase | UserService |

## TypeScript 配置

[如果是 TypeScript 项目，填写相关配置信息]

---

*生成时间: [时间戳]*  
*返回索引: [../project-context.md](../project-context.md)*
`;
