// init_project 工具实现
export async function initProject(args: any) {
  try {
    const input = args?.input || "";
    const projectName = args?.project_name || "新项目";
    const featureSlug = projectName.toLowerCase().replace(/\s+/g, '-');

    const message = `你需要按照 Spec-Driven Development（规范驱动开发）的方式初始化项目，参考 https://github.com/github/spec-kit 的工作流程。

📋 **项目需求**：
${input}

🎯 **初始化步骤**：

**第一步：创建项目基础结构**
在当前工作区创建以下目录和文件：

\`\`\`
.
├── docs/
│   ├── project-context.md           # 项目上下文（技术栈、架构、规范）
│   ├── constitution.md              # 项目宪法（核心原则和约束）
│   └── specs/
│       └── ${featureSlug}/
│           ├── requirements.md      # 需求文档（EARS 格式）
│           ├── design.md            # 设计文档
│           ├── tasks.md             # 任务分解
│           └── research.md          # 技术调研
├── scripts/
│   ├── check-prerequisites.sh
│   └── setup.sh
└── src/                             # 源代码目录
\`\`\`

**第二步：生成 project-context.md**
在 \`docs/project-context.md\` 中记录项目的核心信息：
- 项目概览（名称、版本、类型、描述）
- 技术栈（语言、框架、构建工具、测试框架）
- 项目结构（目录说明、入口文件）
- 架构模式（设计模式、模块划分）
- 编码规范（代码风格、命名规范）
- 依赖管理（主要依赖列表）
- 开发流程（常用命令）

**第三步：生成 constitution.md**
在 \`docs/constitution.md\` 中定义项目的核心原则：
- 代码风格规范
- 架构原则
- 安全准则
- 测试要求
- 文档标准

**第四步：生成 requirements.md（需求文档）**
在 \`docs/specs/${featureSlug}/requirements.md\` 中详细描述：
- 功能概述
- 术语定义
- 需求列表（使用 EARS 格式）
  - 用户故事（As a... I want... So that...）
  - 验收标准（WHEN/WHILE/IF...THEN...SHALL）
- 非功能需求（性能、安全、兼容性）
- 依赖关系

**EARS 格式说明**：
| 模式 | 格式 | 适用场景 |
|------|------|----------|
| Ubiquitous | THE [system] SHALL [response] | 始终适用的需求 |
| Event-driven | WHEN [trigger], THE [system] SHALL [response] | 事件触发的需求 |
| State-driven | WHILE [condition], THE [system] SHALL [response] | 状态相关的需求 |
| Unwanted | IF [condition], THEN THE [system] SHALL [response] | 异常处理需求 |

**第五步：生成 design.md（设计文档）**
在 \`docs/specs/${featureSlug}/design.md\` 中描述：
- 技术方案（技术选型及理由）
- 架构设计（系统架构图）
- 数据模型（数据结构定义）
- API 设计（接口定义）
- 文件结构（新增/修改的文件）
- 设计决策（重要决策及理由）
- 风险评估

**第六步：生成 research.md（技术调研）**
在 \`docs/specs/${featureSlug}/research.md\` 中记录：
- 技术栈调研结果
- 版本兼容性确认
- 潜在风险识别
- 最佳实践记录
- 参考文档链接

**第七步：生成 tasks.md（任务分解）**
在 \`docs/specs/${featureSlug}/tasks.md\` 中分解任务：

\`\`\`markdown
# 任务清单：${projectName}

## 概述
实现 ${projectName} 的任务分解。

---

## 任务列表

### 阶段 1: 项目初始化
- [ ] 1.1 搭建项目骨架
  - 创建目录结构
  - 初始化 package.json
  - _需求: 1.1_

- [ ] 1.2 配置开发环境
  - 配置 TypeScript/ESLint/Prettier
  - _需求: 1.1_

### 阶段 2: 核心功能实现
- [ ] 2.1 实现数据模型
  - 定义数据结构
  - _需求: 2.1_

- [ ] 2.2 实现业务逻辑
  - 核心功能开发
  - 依赖: 任务 2.1
  - _需求: 2.2_

### 阶段 3: 集成测试
- [ ] 3.1 编写测试用例
  - 单元测试
  - 集成测试
  - _需求: 3.1_

---

## 检查点
- [ ] 阶段 1 完成后：项目可运行
- [ ] 阶段 2 完成后：核心功能可用
- [ ] 阶段 3 完成后：测试通过

---

## 文件变更清单
| 文件 | 操作 | 说明 |
|------|------|------|
| src/index.ts | 新建 | 入口文件 |
| package.json | 新建 | 项目配置 |

---

**标记说明**：
- [P]: 可以并行执行的任务
- 依赖: 必须在指定任务完成后才能开始
- _需求: x.x_: 关联的需求编号
\`\`\`

**第八步：生成辅助脚本**
创建项目管理脚本：
- \`scripts/check-prerequisites.sh\`: 检查环境依赖
- \`scripts/setup.sh\`: 自动化项目初始化

📝 **注意事项**：
1. 所有文档统一放在 \`docs/\` 目录下
2. 功能规格放在 \`docs/specs/{feature-name}/\` 目录
3. 所有文件使用 Markdown 格式，保持清晰的结构
4. 遵循项目 constitution 中定义的原则
5. 任务分解要足够细致，每个任务应该在 2-4 小时内完成
6. 标记清楚任务之间的依赖关系
7. 识别可以并行执行的任务以优化开发效率

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

