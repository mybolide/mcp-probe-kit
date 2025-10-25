# 🚀 快速发布指南

5 分钟发布到 npm 和 GitHub！

---

## ⚠️ 发布前必做（3 步）

### 1. 更新 package.json 中的 GitHub 地址

```bash
# 编辑 package.json，替换为你的 GitHub 用户名
"repository": {
  "url": "https://github.com/mybolide/mcp-probe-kit.git"
},
"bugs": {
  "url": "https://github.com/mybolide/mcp-probe-kit/issues"
},
"homepage": "https://github.com/mybolide/mcp-probe-kit#readme"
```

### 2. 创建 GitHub 仓库

访问 https://github.com/new

- **仓库名**: `mcp-probe-kit`
- **描述**: "🚀 Cursor Development Enhancement Toolkit - 22 practical MCP tools"
- **公开**（Public）
- **不要**初始化 README

### 3. 推送代码到 GitHub

```bash
# 添加远程仓库
git remote add origin https://github.com/mybolide/mcp-probe-kit.git

# 推送代码
git push -u origin main
```

---

## 📦 发布到 npm（3 步）

### 1. 登录 npm

如果还没有 npm 账号，先注册：https://www.npmjs.com/signup

```bash
npm login
```

输入用户名、密码、邮箱

### 2. 测试打包

```bash
# 查看将要发布的文件
npm pack --dry-run
```

检查输出，确保只包含必要文件（build、README.md、LICENSE）

### 3. 发布！

```bash
npm publish
```

完成！访问 https://www.npmjs.com/package/mcp-probe-kit 查看你的包！

---

## 🎉 发布后

### 1. 创建 GitHub Release

1. 访问你的仓库 → Releases → Create a new release
2. Tag: `v1.0.0`
3. Title: `v1.0.0 - Initial Release 🎉`
4. 描述：复制下面的内容

```markdown
## ✨ 首次发布

MCP Probe Kit - 包含 22 个实用工具的 Cursor 开发增强工具集！

### 🔥 核心功能

**代码质量（7 个工具）**
- `detect_shell` - 套壳检测
- `code_review` - 代码审查
- `debug` - 调试助手
- `gentest` - 测试生成
- `refactor` - 重构建议
- `perf` - 性能分析
- `fix` - 自动修复

**开发效率（11 个工具）**
- `gencommit` - Git 提交生成
- `genapi` - API 文档
- `gendoc` - 代码注释
- `genpr` - PR 描述
- `genchangelog` - Changelog
- `gensql` - SQL 生成器
- `genui` - UI 组件（React/Vue）
- `explain` - 代码解释
- `convert` - 代码转换
- `genreadme` - README 生成
- `split` - 文件拆分

**项目管理（4 个工具）**
- `init_setting` - Cursor 配置
- `init_project` - 项目初始化
- `check_deps` - 依赖检查
- `resolve_conflict` - Git 冲突解决

### 📦 安装

\`\`\`bash
# 通过 npm 全局安装
npm install -g mcp-probe-kit

# 或添加到 Cursor MCP 配置
\`\`\`

### 📖 使用文档

完整文档请查看 [README.md](https://github.com/mybolide/mcp-probe-kit#readme)

### 🙏 致谢

感谢所有用户的支持！欢迎提交 Issue 和 PR！
```

### 2. 宣传分享（可选）

**Twitter/X**:
```
🎉 刚发布了 MCP Probe Kit v1.0.0！

一个包含 22 个实用工具的 Cursor 开发增强工具集：
✅ 代码审查、自动修复
✅ SQL/UI 生成（React + Vue）
✅ 文件拆分、代码转换
✅ Git 工具集

📦 npm install -g mcp-probe-kit
🔗 GitHub 地址

#Cursor #MCP #AI #DevTools
```

**Reddit** (r/Cursor):
```
Title: [Release] MCP Probe Kit - 22 Practical Development Tools for Cursor

Hey everyone! I just released MCP Probe Kit, a collection of 22 MCP tools...
[链接到 GitHub]
```

**中文社区**:
- V2EX: https://www.v2ex.com/new/programmer
- 掘金: 发布文章
- 知乎: 写专栏文章

---

## 📊 发布后检查

### npm 包检查
```bash
# 查看包信息
npm view mcp-probe-kit

# 测试安装
npm install -g mcp-probe-kit
mcp-probe-kit --version
```

### GitHub 仓库检查
- [ ] README 显示正常
- [ ] LICENSE 文件存在
- [ ] Release 已创建
- [ ] Topics 已添加（mcp, cursor, ai-tools 等）

---

## 🔄 后续更新

### 发布新版本

```bash
# 1. 修改代码...

# 2. 更新版本号
npm version patch  # bug 修复: 1.0.0 -> 1.0.1
npm version minor  # 新功能: 1.0.0 -> 1.1.0
npm version major  # 破坏性更新: 1.0.0 -> 2.0.0

# 3. 推送到 GitHub
git push --tags

# 4. 发布到 npm
npm publish

# 5. 在 GitHub 创建新的 Release
```

---

## ❓ 常见问题

### Q: npm publish 报错 "need auth"
A: 运行 `npm login` 重新登录

### Q: npm publish 报错 "package name already exists"
A: 包名被占用，需要改名或使用 scoped package (@你的用户名/mcp-probe-kit)

### Q: 如何撤回发布？
A: 发布后 72 小时内可以用 `npm unpublish mcp-probe-kit@1.0.0`，但不建议

### Q: 如何更新 npm 上的 README？
A: 修改 README.md 后重新发布一个 patch 版本

---

## 📞 需要帮助？

- 查看完整文档: [PUBLISHING_GUIDE.md](PUBLISHING_GUIDE.md)
- npm 文档: https://docs.npmjs.com/
- GitHub 文档: https://docs.github.com/

---

祝发布顺利！🚀

