import { parseArgs, getString } from "../utils/parseArgs.js";

// genchangelog 工具实现
export async function genchangelog(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      version?: string;
      from?: string;
      to?: string;
    }>(args, {
      defaultValues: {
        version: "",
        from: "",
        to: "HEAD",
      },
      primaryField: "version", // 纯文本输入默认映射到 version 字段
      fieldAliases: {
        version: ["ver", "v", "版本", "版本号"],
        from: ["from_tag", "start", "起始", "起始版本"],
        to: ["to_tag", "end", "结束", "结束版本"],
      },
    });
    
    const version = getString(parsedArgs.version);
    const from = getString(parsedArgs.from);
    const to = getString(parsedArgs.to) || "HEAD";

    const message = `请生成项目的 CHANGELOG（变更日志）：

📝 **版本信息**：
${version || "请提供版本号（如：v1.2.0）"}

📋 **Commit 范围**：
从 ${from || "上一个 tag"} 到 ${to}

---

## Changelog 生成步骤

### 第一步：获取 Commit 历史

执行以下命令：
\`\`\`bash
# 查看 commit 历史
git log ${from}..${to} --oneline --no-merges

# 查看详细信息
git log ${from}..${to} --pretty=format:"%h - %s (%an)" --no-merges

# 查看所有 tags
git tag -l

# 查看贡献者
git shortlog ${from}..${to} -sn
\`\`\`

### 第二步：分类 Commits

按类型分组：
- **✨ Features (feat)**：新功能
- **🐛 Bug Fixes (fix)**：Bug 修复
- **📝 Documentation (docs)**：文档变更
- **💄 Styles (style)**：代码格式
- **♻️ Refactoring (refactor)**：重构
- **⚡ Performance (perf)**：性能优化
- **✅ Tests (test)**：测试相关
- **🔧 Chores (chore)**：构建/工具变更
- **💥 BREAKING CHANGES**：破坏性变更

### 第三步：生成 Changelog

**格式标准**：[Keep a Changelog](https://keepachangelog.com/)

\`\`\`markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [版本号] - YYYY-MM-DD

### Added（新增）
- 新功能 1 (#PR号)
- 新功能 2 by @contributor

### Changed（变更）
- 修改的功能 1
- 修改的功能 2

### Deprecated（废弃）
- 即将移除的功能

### Removed（移除）
- 已移除的功能

### Fixed（修复）
- Bug 修复 1 (#issue号)
- Bug 修复 2

### Security（安全）
- 安全漏洞修复

## [上一个版本] - YYYY-MM-DD

...
\`\`\`

---

## Changelog 模板

\`\`\`markdown
# Changelog

## [${version || "1.2.0"}] - ${new Date().toISOString().split('T')[0]}

### ✨ Added
- 新增用户认证功能 (#123) [@contributor1]
- 新增数据导出功能 (#125)
- 新增邮件通知系统

### 🔄 Changed
- 优化数据库查询性能 (#130)
- 更新 UI 设计风格
- 升级依赖包到最新版本

### 🗑️ Deprecated
- \`oldAPI()\` 方法即将在 v2.0 中移除，请使用 \`newAPI()\`

### ❌ Removed
- 移除了废弃的 \`legacyFeature\`
- 删除了未使用的配置项

### 🐛 Fixed
- 修复登录页面样式错误 (#128)
- 修复数据分页显示问题 (#132)
- 修复内存泄漏问题 (#135)

### 🔒 Security
- 修复 SQL 注入漏洞 (CVE-2024-XXXX)
- 更新依赖以修复安全漏洞

### 💥 BREAKING CHANGES
- API 端点从 \`/api/v1/users\` 改为 \`/api/v2/users\`
- 配置文件格式从 JSON 改为 YAML
- 最低 Node.js 版本要求提升到 18.x

### 📚 Documentation
- 更新 README 文档
- 添加 API 使用指南
- 完善贡献指南

### 🏗️ Infrastructure
- 升级 CI/CD 流程
- 添加 Docker 支持
- 配置自动化测试

### 👥 Contributors
感谢以下贡献者：
- @contributor1 - 3 commits
- @contributor2 - 2 commits
- @contributor3 - 1 commit

**Full Changelog**: https://github.com/owner/repo/compare/v1.1.0...v${version || "1.2.0"}
\`\`\`

---

## Changelog 最佳实践

### 内容要求

1. **明确说明变更**
   - 用户能理解的语言（避免技术术语）
   - 说明影响范围
   - 提供迁移指南（破坏性变更）

2. **链接相关 Issue/PR**
   - 使用 (#123) 格式
   - 方便追溯详细信息

3. **归功贡献者**
   - 使用 @username 格式
   - 体现团队协作

### 版本规范

**语义化版本 (Semantic Versioning)**：
- **Major (X.0.0)**：破坏性变更
- **Minor (x.X.0)**：新功能（向后兼容）
- **Patch (x.x.X)**：Bug 修复

### 发布流程

1. 更新 CHANGELOG.md
2. 更新 package.json 版本号
3. 创建 Git tag：\`git tag -a v1.2.0 -m "Release v1.2.0"\`
4. 推送 tag：\`git push origin v1.2.0\`
5. 发布 GitHub Release

---

## 自动化工具

**推荐工具**：
- **standard-version**：自动生成 changelog
- **conventional-changelog**：基于 commit 生成
- **semantic-release**：自动发布版本

**使用示例**：
\`\`\`bash
# 安装
npm install -D standard-version

# 生成 changelog
npx standard-version

# 首次发布
npx standard-version --first-release
\`\`\`

---

---

## ⚠️ 边界约束

- ❌ 仅输出 CHANGELOG 文本，不自动写入文件
- ❌ 不执行 git 命令
- ✅ 输出完整的 CHANGELOG Markdown

现在请根据 commit 历史生成详细的 CHANGELOG.md 内容。`;

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
          text: `❌ 生成 Changelog 失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

