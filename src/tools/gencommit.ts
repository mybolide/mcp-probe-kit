// gencommit 工具实现
export async function gencommit(args: any) {
  try {
    const changes = args?.changes || "";
    const type = args?.type || ""; // fixed, fix, feat, docs, style, chore, refactor, test

    const message = `请按以下步骤生成规范的 Git commit 消息：

**第一步：获取变更信息**
${changes ? `已提供变更内容：\n${changes}` : `
1. 执行 \`git status\` 查看修改的文件
2. 执行 \`git diff\` 查看具体变更内容
3. 如果有暂存的文件，执行 \`git diff --staged\` 查看暂存区变更
`}

**第二步：分析变更**
- 识别变更类型（新功能、修复、重构等）
- 确定影响范围（哪个模块/功能）
- 总结主要变更点

---

🎯 **Commit 消息规范**（参考 Conventional Commits）：

**格式**：
\`\`\`
<type>(<scope>): <subject>

<body>

<footer>
\`\`\`

**类型（type）**：
- fixed 🐛: 线上/测试缺陷修复
- fix 🐛: 历史中也存在的写法，语义同 fixed，保持兼容
- feat 🎸: 新增或迭代业务功能
- docs ✏️: 文档相关更新
- style 💄: UI/样式调整，无业务逻辑变更
- chore 🤖: 构建、脚本、依赖等杂项
- refactor ♻️（可选）: 重构、内部结构调整，不改变外部行为
- test ✅（可选）: 测试相关

**要求**：
1. subject 使用中文，简洁明了（不超过 50 字）
2. body 详细说明变更内容（可选）
3. footer 引用相关 issue（如有）
4. 如有破坏性变更，添加 BREAKING CHANGE

**示例**：
\`\`\`
feat(auth): 🎸 添加用户登录功能

- 实现 JWT 认证机制
- 添加密码加密存储
- 实现登录失败重试限制

Closes #123
\`\`\`

\`\`\`
fixed(api): 🐛 修复用户数据返回异常

- 修复空值判断逻辑
- 优化错误处理机制

Closes #456
\`\`\`

---

**第三步：生成并提交**
1. 根据变更内容生成符合规范的 commit 消息
2. 使用 \`git commit -m "<生成的消息>"\` 提交
3. 如果消息较长，使用 \`git commit\` 打开编辑器填写完整消息

💡 **提示**：
- 如果暂存区为空，提示用户先使用 \`git add\` 添加文件
- 如果变更较多，建议分多次提交
- 确保 commit 消息清晰描述了"做了什么"和"为什么"

---

现在请开始执行上述步骤。`;

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
          text: `❌ 生成 commit 消息失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

