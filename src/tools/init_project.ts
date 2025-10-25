// init_project 工具实现
export async function initProject(args: any) {
  try {
    const input = args?.input || "";
    const projectName = args?.project_name || "新项目";

    const message = `你需要按照 Spec-Driven Development（规范驱动开发）的方式初始化项目，参考 https://github.com/github/spec-kit 的工作流程。

📋 **项目需求**：
${input}

🎯 **初始化步骤**：

**第一步：创建项目基础结构**
在当前工作区创建以下目录和文件：

\`\`\`
.
├── memory/
│   └── constitution.md    # 项目宪法（核心原则和约束）
├── specs/
│   └── 001-${projectName.toLowerCase().replace(/\s+/g, '-')}/
│       ├── spec.md        # 功能规格说明
│       ├── plan.md        # 实现计划
│       ├── tasks.md       # 任务分解
│       └── research.md    # 技术调研
├── scripts/
│   ├── check-prerequisites.sh
│   └── setup.sh
└── templates/
    ├── spec-template.md
    ├── plan-template.md
    └── tasks-template.md
\`\`\`

**第二步：生成 constitution.md**
在 \`memory/constitution.md\` 中定义项目的核心原则，包括：
- 代码风格规范
- 架构原则
- 安全准则
- 测试要求
- 文档标准

**第三步：生成 spec.md（功能规格）**
在 \`specs/001-${projectName.toLowerCase().replace(/\s+/g, '-')}/spec.md\` 中详细描述：
- 项目背景和目标
- 用户故事（User Stories）
- 功能需求
- 非功能需求
- 约束条件
- 验收标准

**第四步：生成 plan.md（实现计划）**
分析需求并生成实现计划，包括：
- 技术栈选择（框架、数据库、部署方式等）
- 系统架构设计
- 模块划分
- 数据模型设计
- API 设计
- 关键技术决策

**第五步：生成 research.md（技术调研）**
对选定的技术栈进行调研：
- 确认版本兼容性
- 识别潜在风险
- 记录最佳实践
- 列出参考文档

**第六步：生成 tasks.md（任务分解）**
将实现计划分解为可执行的任务，格式如下：
\`\`\`markdown
# 任务分解

## 阶段 1：项目初始化
- [ ] Task 1.1: 搭建项目骨架 (文件: ./setup.sh)
- [ ] Task 1.2: 配置开发环境 (文件: ./devcontainer.json)
- [ ] Task 1.3: [P] 初始化数据库 (文件: ./database/schema.sql)

## 阶段 2：核心功能实现
- [ ] Task 2.1: 实现数据模型 (文件: ./src/models/)
- [ ] Task 2.2: [P] 实现用户认证 (文件: ./src/auth/)
- [ ] Task 2.3: [P] 实现业务逻辑 (文件: ./src/services/)
  依赖: Task 2.1

## 阶段 3：API 开发
- [ ] Task 3.1: 创建 REST API (文件: ./src/api/)
  依赖: Task 2.2, Task 2.3
- [ ] Task 3.2: [P] 编写 API 测试 (文件: ./tests/api/)

## 阶段 4：前端开发
- [ ] Task 4.1: 搭建前端框架 (文件: ./frontend/)
- [ ] Task 4.2: [P] 实现 UI 组件 (文件: ./frontend/components/)
- [ ] Task 4.3: [P] 集成 API (文件: ./frontend/services/)
  依赖: Task 3.1

## 阶段 5：测试与部署
- [ ] Task 5.1: 集成测试 (文件: ./tests/integration/)
- [ ] Task 5.2: 性能测试 (文件: ./tests/performance/)
- [ ] Task 5.3: 部署配置 (文件: ./deploy/)

---
**标记说明**：
- [P]: 可以并行执行的任务
- 依赖: 必须在指定任务完成后才能开始
\`\`\`

**第七步：生成辅助脚本**
创建项目管理脚本：
- \`scripts/check-prerequisites.sh\`: 检查环境依赖
- \`scripts/setup.sh\`: 自动化项目初始化
- \`scripts/create-new-feature.sh\`: 创建新功能分支

📝 **注意事项**：
1. 所有文件使用 Markdown 格式，保持清晰的结构
2. 遵循项目 constitution 中定义的原则
3. 任务分解要足够细致，每个任务应该在 2-4 小时内完成
4. 标记清楚任务之间的依赖关系
5. 识别可以并行执行的任务以优化开发效率

🚀 **开始执行**：
现在请按照上述步骤创建项目结构和所有必需的文档。`;

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
          text: `❌ 初始化项目失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

