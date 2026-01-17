import { parseArgs, getString } from "../utils/parseArgs.js";

// genreadme 工具实现
export async function genreadme(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      project_info?: string;
      style?: string;
    }>(args, {
      defaultValues: {
        project_info: "",
        style: "standard",
      },
      primaryField: "project_info", // 纯文本输入默认映射到 project_info 字段
      fieldAliases: {
        project_info: ["info", "description", "project", "项目信息", "项目描述"],
        style: ["format", "type", "风格", "模板"],
      },
    });
    
    const projectInfo = getString(parsedArgs.project_info);
    const style = getString(parsedArgs.style) || "standard"; // standard, minimal, detailed

    const message = `请生成项目的 README.md 文档：

📝 **项目信息**：
${projectInfo || "请提供项目相关信息或代码"}

📋 **风格**：${style}

---

## README 生成指南

### 标准结构

一个完整的 README 应该包含以下部分：

1. **项目标题和简介** - 项目名称、一句话介绍、徽章
2. **功能特性** - 核心功能列表
3. **快速开始** - 安装、配置、运行
4. **使用示例** - 代码示例和截图
5. **API 文档** - 接口说明（如适用）
6. **配置说明** - 环境变量、配置文件
7. **开发指南** - 如何贡献、开发流程
8. **测试** - 如何运行测试
9. **部署** - 部署步骤
10. **FAQ** - 常见问题
11. **许可证** - 开源协议
12. **致谢** - 贡献者、参考资料

---

## README 模板示例

### 1️⃣ 标准模板（推荐）

\`\`\`markdown
# 项目名称

<div align="center">
  <img src="logo.png" alt="Logo" width="200">
  
  <p>一句话简介 - 简洁有力地描述项目的核心价值</p>

  <p>
    <a href="#快速开始">快速开始</a> •
    <a href="#功能特性">功能特性</a> •
    <a href="#文档">文档</a> •
    <a href="#贡献">贡献</a>
  </p>

  <p>
    <img src="https://img.shields.io/github/stars/username/repo?style=social" alt="Stars">
    <img src="https://img.shields.io/npm/v/package-name" alt="npm">
    <img src="https://img.shields.io/github/license/username/repo" alt="License">
    <img src="https://img.shields.io/github/workflow/status/username/repo/CI" alt="Build">
  </p>
</div>

---

## ✨ 功能特性

- 🚀 **高性能** - 详细说明性能优势
- 💡 **易用性** - 简单的 API 设计
- 🔧 **可扩展** - 插件系统支持
- 📦 **开箱即用** - 零配置启动
- 🛡️ **类型安全** - 完整的 TypeScript 支持
- 🎨 **主题定制** - 灵活的样式配置

## 📦 安装

\`\`\`bash
# npm
npm install package-name

# yarn
yarn add package-name

# pnpm
pnpm add package-name
\`\`\`

## 🚀 快速开始

### 基础用法

\`\`\`javascript
import { someFunction } from 'package-name';

const result = someFunction({
  option1: 'value1',
  option2: 'value2'
});

console.log(result);
\`\`\`

### 高级用法

\`\`\`javascript
import { AdvancedFeature } from 'package-name';

const instance = new AdvancedFeature({
  // 配置选项
  advanced: true,
  plugins: [
    'plugin1',
    'plugin2'
  ]
});

await instance.run();
\`\`\`

## 📖 使用示例

### 示例 1：基础场景

\`\`\`typescript
// 示例代码
import { Example } from 'package-name';

const example = new Example();
example.doSomething();
\`\`\`

**输出：**
\`\`\`
示例输出结果
\`\`\`

### 示例 2：复杂场景

\`\`\`typescript
// 更复杂的示例
import { AdvancedExample } from 'package-name';

const config = {
  mode: 'production',
  cache: true,
  optimizations: ['minify', 'treeshake']
};

const result = await AdvancedExample.process(config);
\`\`\`

## 🎯 核心概念

### 概念 1：重要概念名称

简要说明这个概念的定义和重要性。

\`\`\`javascript
// 代码示例
\`\`\`

### 概念 2：另一个重要概念

解释第二个核心概念。

## ⚙️ 配置

### 配置文件

在项目根目录创建 \`config.js\`：

\`\`\`javascript
module.exports = {
  // 基础配置
  port: 3000,
  host: 'localhost',
  
  // 高级配置
  plugins: ['plugin-name'],
  middleware: [],
  
  // 环境特定配置
  development: {
    debug: true
  },
  production: {
    debug: false,
    optimize: true
  }
};
\`\`\`

### 环境变量

\`\`\`.env
# 应用配置
APP_NAME=MyApp
APP_ENV=production

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp
DB_USER=admin
DB_PASSWORD=secret

# API 配置
API_KEY=your_api_key_here
API_URL=https://api.example.com
\`\`\`

## 📚 API 文档

### \`functionName(params)\`

**描述**：函数的作用说明

**参数**：

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| param1 | string | 是 | - | 参数1说明 |
| param2 | number | 否 | 0 | 参数2说明 |
| options | object | 否 | {} | 配置对象 |

**返回值**：

- **类型**：Promise<Result>
- **说明**：返回值的详细说明

**示例**：

\`\`\`typescript
const result = await functionName('value', 42, {
  option: true
});
\`\`\`

## 🏗️ 项目结构

\`\`\`
project-root/
├── src/
│   ├── core/           # 核心功能
│   ├── utils/          # 工具函数
│   ├── types/          # TypeScript 类型定义
│   └── index.ts        # 入口文件
├── tests/              # 测试文件
│   ├── unit/           # 单元测试
│   └── integration/    # 集成测试
├── docs/               # 文档
├── examples/           # 示例代码
├── .github/            # GitHub 配置
│   └── workflows/      # CI/CD
├── package.json
├── tsconfig.json
└── README.md
\`\`\`

## 🧪 测试

\`\`\`bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 生成覆盖率报告
npm run test:coverage
\`\`\`

## 🔨 开发

### 环境要求

- Node.js >= 16
- npm >= 8 或 yarn >= 1.22

### 本地开发

\`\`\`bash
# 克隆项目
git clone https://github.com/username/repo.git
cd repo

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建项目
npm run build

# 运行 Linter
npm run lint

# 格式化代码
npm run format
\`\`\`

### 提交规范

本项目使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

\`\`\`
feat: 新功能
fix: 修复 Bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
test: 测试相关
chore: 构建/工具链相关
\`\`\`

## 🚀 部署

### Docker 部署

\`\`\`bash
# 构建镜像
docker build -t app-name .

# 运行容器
docker run -p 3000:3000 app-name
\`\`\`

### Vercel 部署

\`\`\`bash
npm install -g vercel
vercel --prod
\`\`\`

### 传统服务器部署

\`\`\`bash
# 构建生产版本
npm run build

# 启动应用
npm start
\`\`\`

## 🤝 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

### 贡献步骤

1. Fork 本仓库
2. 创建特性分支 (\`git checkout -b feature/AmazingFeature\`)
3. 提交更改 (\`git commit -m 'feat: Add some AmazingFeature'\`)
4. 推送到分支 (\`git push origin feature/AmazingFeature\`)
5. 开启 Pull Request

## 📝 变更日志

查看 [CHANGELOG.md](CHANGELOG.md) 了解版本历史。

## ❓ FAQ

### 问题 1：常见问题描述？

答案和解决方案。

\`\`\`bash
# 示例命令
npm run fix-issue
\`\`\`

### 问题 2：另一个常见问题？

详细的解答。

## 🔗 相关链接

- [官方文档](https://docs.example.com)
- [API 参考](https://api.example.com)
- [示例集合](https://examples.example.com)
- [社区论坛](https://forum.example.com)

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

## 👥 贡献者

感谢所有贡献者的付出！

<a href="https://github.com/username/repo/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=username/repo" />
</a>

## 🙏 致谢

- 感谢 [project-name](https://github.com/user/project) 提供灵感
- 参考了 [another-project](https://github.com/user/another) 的设计
- 使用了 [library-name](https://github.com/user/library) 库

---

<div align="center">
  Made with ❤️ by <a href="https://github.com/username">Your Name</a>
</div>
\`\`\`

---

### 2️⃣ 极简模板

适合小型工具/库：

\`\`\`markdown
# 项目名称

> 一句话介绍

[![npm](https://img.shields.io/npm/v/package)](https://www.npmjs.com/package/package)
[![license](https://img.shields.io/npm/l/package)](LICENSE)

## 安装

\`\`\`bash
npm install package-name
\`\`\`

## 使用

\`\`\`javascript
import { func } from 'package-name';

func('hello');
\`\`\`

## API

### \`func(param)\`

功能说明。

## 许可证

MIT
\`\`\`

---

### 3️⃣ 详细文档模板

适合大型项目：

（包含标准模板的所有内容，再添加）

\`\`\`markdown
## 🏛️ 架构设计

### 系统架构图

\`\`\`
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
┌──────▼──────┐
│  API Layer  │
└──────┬──────┘
       │
┌──────▼──────┐
│ Business    │
│ Logic Layer │
└──────┬──────┘
       │
┌──────▼──────┐
│  Data Layer │
└─────────────┘
\`\`\`

### 核心模块

#### 模块 1：认证系统
- JWT token 管理
- OAuth 集成
- 权限控制

#### 模块 2：数据处理
- 数据验证
- 转换管道
- 缓存策略

## 📊 性能指标

- 响应时间：< 100ms (P95)
- 吞吐量：10000 req/s
- 内存占用：< 50MB
- 打包体积：< 20KB (gzipped)

## 🔒 安全

- 所有输入经过验证和清理
- 使用 HTTPS 加密传输
- 实施 CORS 策略
- 定期安全审计

## 🌍 浏览器支持

| Chrome | Firefox | Safari | Edge |
|--------|---------|--------|------|
| ✅ 90+ | ✅ 88+ | ✅ 14+ | ✅ 90+ |

## 🗺️ 路线图

- [ ] v1.1 - 新功能 A
- [ ] v1.2 - 性能优化
- [ ] v2.0 - 重大重构
- [ ] v2.1 - 新功能 B

## 📈 统计数据

- ⭐ GitHub Stars: 1.2k
- 📦 NPM Downloads: 50k/month
- 🐛 Open Issues: 5
- 👥 Contributors: 25

\`\`\`

---

## README 最佳实践

### ✅ Do's（应该做的）

1. **开头抓眼球**
   - 清晰的项目名称
   - 简洁有力的介绍
   - 视觉吸引力（logo、徽章）

2. **快速上手**
   - 5 分钟内能运行起来
   - 提供可复制的代码
   - 包含常见用例

3. **结构清晰**
   - 使用标题层级
   - 添加目录导航
   - 分段合理

4. **代码示例丰富**
   - 真实可用的代码
   - 覆盖常见场景
   - 包含输出结果

5. **持续更新**
   - 与代码同步
   - 标注版本信息
   - 更新日志

### ❌ Don'ts（不应该做的）

1. ❌ 过长的介绍（开门见山）
2. ❌ 缺少代码示例（纸上谈兵）
3. ❌ 过时的信息（误导用户）
4. ❌ 没有安装说明（提高门槛）
5. ❌ 技术术语过多（吓跑新手）

---

## 徽章生成器

常用徽章来源：

- **Shields.io**: https://shields.io/
- **npm**: \`https://img.shields.io/npm/v/package-name\`
- **License**: \`https://img.shields.io/github/license/user/repo\`
- **Build**: \`https://img.shields.io/github/workflow/status/user/repo/CI\`
- **Coverage**: \`https://img.shields.io/codecov/c/github/user/repo\`
- **Downloads**: \`https://img.shields.io/npm/dm/package-name\`

---

现在请根据项目信息生成完整的 README.md，包括：
1. 项目标题和简介
2. 安装和快速开始
3. 功能特性列表
4. 使用示例
5. API 文档（如适用）
6. 贡献指南
7. 许可证信息`;

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
          text: `❌ 生成 README 失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

