// genpr 工具实现
export async function genpr(args: any) {
  try {
    const branch = args?.branch || "";
    const commits = args?.commits || "";

    const message = `请生成规范的 Pull Request 描述：

📝 **分支信息**：
${branch || "请提供分支名称"}

📋 **Commit 历史**：
${commits || "请先执行 git log 查看 commit 历史"}

---

## PR 描述生成指南

### 第一步：分析变更内容

执行以下命令获取详细信息：
\`\`\`bash
# 查看 commit 历史
git log origin/main..HEAD --oneline

# 查看具体变更
git diff origin/main..HEAD --stat

# 查看修改的文件
git diff origin/main..HEAD --name-only
\`\`\`

### 第二步：生成 PR 描述

**标准 PR 模板**：

\`\`\`markdown
## 📝 变更说明

### 概述
简要说明这个 PR 的目的和背景（2-3 句话）

### 变更内容
- 🎨 UI/UX 改进：...
- ✨ 新功能：...
- 🐛 Bug 修复：...
- ♻️ 重构：...
- 📝 文档更新：...
- 🚀 性能优化：...

## 🎯 解决的问题

Closes #123
Fixes #456
Relates to #789

## 🔧 技术细节

### 主要修改
1. **模块 A**：修改内容和原因
2. **模块 B**：修改内容和原因

### 架构变更（如有）
- 数据库 Schema 变更
- API 接口变更
- 配置文件变更

### 依赖变更（如有）
- 新增依赖：\`package-name@version\`
- 移除依赖：\`old-package\`
- 升级依赖：\`package@old → package@new\`

## ✅ 测试计划

### 单元测试
- [x] 新增测试用例覆盖新功能
- [x] 所有测试通过
- [x] 测试覆盖率 > 80%

### 集成测试
- [x] API 接口测试通过
- [x] 端到端测试通过

### 手动测试
- [x] 功能 A 正常工作
- [x] 功能 B 正常工作
- [x] 边界情况验证

## 📸 截图/录屏（UI 变更时）

### Before
![Before Screenshot](url)

### After
![After Screenshot](url)

## ⚠️ 注意事项

### Breaking Changes（破坏性变更）
- ⚠️ API 路径从 \`/old\` 改为 \`/new\`
- ⚠️ 配置文件格式变更

### 部署注意
- 需要执行数据库迁移：\`npm run migrate\`
- 需要更新环境变量：\`NEW_VAR=value\`
- 需要重启服务

### 向后兼容性
- ✅ 完全兼容
- ⚠️ 部分兼容（说明不兼容的部分）
- ❌ 不兼容（需要特殊处理）

## 📋 Checklist

- [ ] 代码通过 lint 检查
- [ ] 所有测试通过
- [ ] 文档已更新
- [ ] Changelog 已更新
- [ ] 性能影响已评估
- [ ] 安全影响已评估
- [ ] 代码已自我审查
- [ ] 已添加必要的注释

## 🔗 相关链接

- 设计文档：[链接]
- 技术方案：[链接]
- 相关 PR：#xxx

## 👥 审查者

@reviewer1 @reviewer2

## 🙏 致谢

感谢 @contributor1 的建议
\`\`\`

---

## PR 标题规范

格式：\`<type>(<scope>): <subject>\`

**示例**：
- \`feat(auth): 添加 OAuth2 登录支持\`
- \`fix(api): 修复用户查询接口分页错误\`
- \`refactor(ui): 重构组件层级结构\`

---

现在请根据变更内容生成完整的 PR 描述，并建议合适的审查者。`;

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
          text: `❌ 生成 PR 描述失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

