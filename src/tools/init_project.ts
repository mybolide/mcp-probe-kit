import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { ensureMcpProbeKitBootstrap } from "../lib/workflow-skill-installer.js";
import { MCP_PROBE_SKILL_REL_PATH } from "../lib/workflow-skill-template.js";
import { resolveWorkspaceRootWithMeta } from "../lib/workspace-root.js";
import { toPosixPath } from "../lib/project-context-layout.js";
import type { ProjectInit } from "../schemas/output/project-tools.js";

/**
 * init_project 工具
 * 
 * 功能：按照 Spec-Driven Development 方式初始化项目
 * 输出：项目结构、文档模板和初始化指南
 */
export async function initProject(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      input?: string;
      project_name?: string;
      project_root?: string;
    }>(args, {
      defaultValues: {
        input: "",
        project_name: "新项目",
        project_root: "",
      },
      primaryField: "input", // 纯文本输入默认映射到 input 字段
      fieldAliases: {
        input: ["requirement", "description", "需求", "项目需求"],
        project_name: ["name", "project", "项目名", "项目名称"],
        project_root: ["root", "path", "项目路径", "projectRoot", "projectPath", "workspace"],
      },
    });
    
    const input = getString(parsedArgs.input);
    const projectName = getString(parsedArgs.project_name) || "新项目";
    const rootResolution = resolveWorkspaceRootWithMeta(getString(parsedArgs.project_root));
    const projectRoot = rootResolution.root;
    const bootstrap = ensureMcpProbeKitBootstrap(projectRoot);
    const pathWarnings = [rootResolution.warning, bootstrap.workspaceWarning].filter(
      (item): item is string => Boolean(item)
    );
    const warningBlock = pathWarnings.length
      ? `\n⚠️ **路径 / 工作区**\n${pathWarnings.map((w) => `- ${w}`).join("\n")}\n`
      : "";
    const featureSlug = projectName.toLowerCase().replace(/\s+/g, '-');
    const agentsRel = toPosixPath(bootstrap.agentsMd.path);
    const bootstrapWritten = [
      { path: MCP_PROBE_SKILL_REL_PATH, action: bootstrap.skill.created ? "created" as const : bootstrap.skill.updated ? "updated" as const : "skipped" as const },
      { path: agentsRel, action: bootstrap.agentsMd.created ? "created" as const : bootstrap.agentsMd.updated ? "updated" as const : "skipped" as const },
    ];
    const pendingFiles = [
      { path: "docs/project-context.md", reason: "由 Agent 按指南创建" },
      { path: "docs/constitution.md", reason: "由 Agent 按指南创建" },
      { path: `docs/specs/${featureSlug}/requirements.md`, reason: "由 Agent 按指南创建" },
      { path: `docs/specs/${featureSlug}/design.md`, reason: "由 Agent 按指南创建" },
      { path: `docs/specs/${featureSlug}/tasks.md`, reason: "由 Agent 按指南创建" },
      { path: `docs/specs/${featureSlug}/research.md`, reason: "由 Agent 按指南创建" },
      { path: "scripts/check-prerequisites.sh", reason: "由 Agent 按指南创建" },
      { path: "scripts/setup.sh", reason: "由 Agent 按指南创建" },
      { path: "src/", reason: "由 Agent 按项目类型创建源代码目录" },
    ];

    const message = `你需要按照 Spec-Driven Development（规范驱动开发）的方式初始化项目，参考 https://github.com/github/spec-kit 的工作流程。

📋 **项目需求**：
${input}
${warningBlock}
📌 **MCP 已自动同步（必须先落盘）**（项目根: \`${toPosixPath(projectRoot)}\`）：
- \`${MCP_PROBE_SKILL_REL_PATH}\`${bootstrap.skill.created ? "（已创建）" : bootstrap.skill.updated ? "（已升级）" : "（已是最新）"}
- \`${agentsRel}\`${bootstrap.agentsMd.created ? "（已创建）" : bootstrap.agentsMd.updated ? "（已更新）" : ""}

🎯 **初始化步骤**：

**第零步：确认 MCP 产物（已完成服务端写入，Agent 勿跳过）**
- Skill 与 AGENTS.md 已由 mcp-probe-kit 写入上述路径
- 若未看到文件，确认已从目标项目目录打开 MCP 客户端，或在工具参数中传 \`project_root\` 绝对路径

**第一步：创建项目基础结构**
在当前工作区创建以下目录和文件：

\`\`\`
.
├── .agents/
│   └── skills/
│       └── mcp-probe-kit/
│           └── SKILL.md             # MCP 调用时机（已自动创建）
├── AGENTS.md                        # Agent 规则（已自动创建/更新）
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
MCP 已写入 Skill 与 AGENTS.md。请按上述步骤由 Agent 创建 docs、scripts、src 及 specs 文档。`;

    // 创建结构化数据对象
    const structuredData: ProjectInit = {
      summary: `初始化项目：${projectName}`,
      projectName: projectName,
      projectRoot: toPosixPath(projectRoot),
      bootstrap: {
        skillPath: MCP_PROBE_SKILL_REL_PATH,
        agentsMdPath: agentsRel,
        skillCreated: bootstrap.skill.created,
        skillUpdated: bootstrap.skill.updated,
        agentsCreated: bootstrap.agentsMd.created,
        agentsUpdated: bootstrap.agentsMd.updated,
        workspaceWarnings: pathWarnings,
        rootSource: rootResolution.source,
        explicitHonored: rootResolution.explicitHonored,
      },
      structure: {
        directories: [
          '.agents/skills/mcp-probe-kit/',
          'docs/',
          'docs/specs/',
          `docs/specs/${featureSlug}/`,
          'scripts/',
          'src/'
        ],
        writtenFiles: bootstrapWritten.map((file) => file.path),
        plannedFiles: pendingFiles.map((file) => file.path),
      },
      writtenFiles: bootstrapWritten,
      pendingFiles,
      nextSteps: [
        '确认 Skill 与 AGENTS.md 已落盘',
        '按指南创建 docs/ 文档与 specs',
        '创建 scripts/ 辅助脚本',
        '创建 src/ 源代码目录',
        '运行 init_project_context 生成完整上下文与图谱',
      ]
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/project-tools.js")).ProjectInitSchema,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    
    const errorData: ProjectInit = {
      summary: "项目初始化失败",
      projectName: "",
      structure: {
        directories: [],
        files: []
      },
      nextSteps: []
    };
    
    return okStructured(`❌ 初始化项目失败: ${errorMessage}`, errorData, {
      schema: (await import("../schemas/output/project-tools.js")).ProjectInitSchema,
    });
  }
}

