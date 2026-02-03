# 技术栈

> 本文档描述 MCP Probe Kit 的技术栈信息。

## 基本信息

| 属性 | 值 |
|------|-----|
| 项目名称 | MCP Probe Kit |
| 版本 | 3.0.1 |
| 语言 | TypeScript |
| 框架 | Model Context Protocol (MCP) SDK |

## 技术栈详情

### 核心技术

| 类别 | 技术 | 版本 |
|------|------|------|
| 语言 | TypeScript | 5.3.0+ |
| 运行时 | Node.js | 16.0.0+ |
| 模块系统 | ES Modules (Node16) | - |
| 框架 | @modelcontextprotocol/sdk | 1.25.3 |

### 开发工具

| 类别 | 工具 | 用途 |
|------|------|------|
| 构建工具 | TypeScript Compiler (tsc) | 编译 TypeScript 到 JavaScript |
| 测试框架 | Vitest | 单元测试和集成测试 |
| 测试工具 | fast-check | 属性测试（Property-based Testing） |
| 开发工具 | tsx | TypeScript 脚本执行 |

### 主要依赖

| 依赖包 | 版本 | 用途 |
|--------|------|------|
| @modelcontextprotocol/sdk | ^1.25.3 | MCP 协议核心 SDK，提供服务器和客户端实现 |
| csv-parse | ^6.1.0 | CSV 文件解析，用于 UI/UX 数据处理 |
| tar | ^7.5.6 | TAR 归档文件处理，用于数据同步 |

### 开发依赖

| 依赖包 | 版本 | 用途 |
|--------|------|------|
| @types/node | ^20.0.0 | Node.js 类型定义 |
| @types/tar | ^6.1.13 | tar 库类型定义 |
| @vitest/ui | ^4.0.18 | Vitest 测试 UI 界面 |
| fast-check | ^4.5.3 | 属性测试库 |
| tsx | ^4.21.0 | TypeScript 执行器 |
| typescript | ^5.3.0 | TypeScript 编译器 |
| vitest | ^4.0.18 | 测试框架 |

## 编译配置

### TypeScript 配置 (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  }
}
```

**关键配置说明：**
- `target: ES2022` - 编译目标为 ES2022
- `module: Node16` - 使用 Node.js 16+ 的 ES 模块系统
- `strict: true` - 启用所有严格类型检查
- `declaration: true` - 生成 .d.ts 类型声明文件

## 脚本命令

| 命令 | 用途 |
|------|------|
| `npm run build` | 编译 TypeScript 代码 |
| `npm run watch` | 监听模式编译 |
| `npm run dev` | 开发模式（编译并运行） |
| `npm test` | 运行测试（单次） |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run test:ui` | 启动测试 UI 界面 |
| `npm run inspector` | 启动 MCP Inspector 调试工具 |
| `npm run sync-ui-data` | 同步 UI/UX 数据 |

---
*返回索引: [../project-context.md](../project-context.md)*
