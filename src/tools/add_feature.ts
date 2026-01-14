/**
 * add_feature 工具
 * 
 * 功能：为已有项目添加新功能的规格文档
 * 模式：指令生成器模式 - 返回详细的生成指南，由 AI 执行实际操作
 * 
 * 输出文件：
 * - docs/specs/{feature_name}/requirements.md - 需求文档
 * - docs/specs/{feature_name}/design.md - 设计文档
 * - docs/specs/{feature_name}/tasks.md - 任务清单
 */

// 默认文档目录
const DEFAULT_DOCS_DIR = "docs";

// 提示词模板
const PROMPT_TEMPLATE = `# 添加新功能指南

## 🎯 任务目标

为项目添加新功能：**{feature_name}**

**功能描述**: {description}

**输出文件**:
- \`{docs_dir}/specs/{feature_name}/requirements.md\` - 需求文档
- \`{docs_dir}/specs/{feature_name}/design.md\` - 设计文档
- \`{docs_dir}/specs/{feature_name}/tasks.md\` - 任务清单

---

## 📋 前置检查

### 步骤 1: 检查项目上下文

**操作**:
1. 检查文件 \`{docs_dir}/project-context.md\` 是否存在
2. 如果存在：
   - 读取文件内容
   - 提取技术栈、架构模式、编码规范等信息
   - 在后续文档生成中参考这些信息
3. 如果不存在：
   - 显示提示："建议先运行 init_project_context 工具生成项目上下文"
   - 可以继续生成文档，但内容会更通用

### 步骤 2: 创建目录

**操作**:
1. 创建目录 \`{docs_dir}/specs/{feature_name}/\`
2. 如果目录已存在，询问用户是否覆盖

---

## 📝 生成 requirements.md

在 \`{docs_dir}/specs/{feature_name}/requirements.md\` 中生成以下内容：

\`\`\`markdown
# 需求文档：{feature_name}

## 功能概述

{description}

## 术语定义

- **[术语1]**: [定义]
- **[术语2]**: [定义]

---

## 需求列表

### 需求 1: [需求标题]

**用户故事:** 作为 [角色]，我想要 [功能]，以便 [目标]。

#### 验收标准

1. WHEN [触发条件] THEN 系统 SHALL [响应]
2. WHILE [状态条件] THE 系统 SHALL [响应]
3. IF [异常条件] THEN 系统 SHALL [处理方式]

---

### 需求 2: [需求标题]

**用户故事:** 作为 [角色]，我想要 [功能]，以便 [目标]。

#### 验收标准

1. THE 系统 SHALL [响应]
2. WHEN [触发条件] THE 系统 SHALL [响应]

---

## EARS 格式说明

本文档使用 EARS (Easy Approach to Requirements Syntax) 格式编写需求：

| 模式 | 格式 | 适用场景 |
|------|------|----------|
| Ubiquitous | THE [system] SHALL [response] | 始终适用的需求 |
| Event-driven | WHEN [trigger], THE [system] SHALL [response] | 事件触发的需求 |
| State-driven | WHILE [condition], THE [system] SHALL [response] | 状态相关的需求 |
| Unwanted | IF [condition], THEN THE [system] SHALL [response] | 异常处理需求 |
| Optional | WHERE [option], THE [system] SHALL [response] | 可选功能需求 |

---

## 非功能需求

### 性能要求
- [性能相关需求]

### 安全要求
- [安全相关需求]

### 兼容性要求
- [兼容性相关需求]

---

## 依赖关系

- [列出与其他功能的依赖]

---

*文档版本: 1.0.0*
*创建时间: [当前时间]*
\`\`\`

### requirements.md 编写指南

1. **功能概述**: 用 2-3 句话描述功能的目的和价值
2. **术语定义**: 定义文档中使用的专业术语
3. **需求列表**: 
   - 每个需求有独立的标题
   - 包含用户故事（As a... I want... So that...）
   - 验收标准使用 EARS 格式
4. **非功能需求**: 性能、安全、兼容性等
5. **依赖关系**: 与其他功能或模块的依赖

---

## 📐 生成 design.md

在 \`{docs_dir}/specs/{feature_name}/design.md\` 中生成以下内容：

\`\`\`markdown
# 设计文档：{feature_name}

## 概述

{description}

本设计文档描述 {feature_name} 功能的技术实现方案。

---

## 技术方案

### 技术选型

| 类别 | 选择 | 理由 |
|------|------|------|
| [类别] | [技术] | [选择理由] |

### 架构设计

[描述功能的架构设计，参考项目现有架构]

\\\`\\\`\\\`
[架构图或流程图，使用 ASCII 或 Mermaid]
\\\`\\\`\\\`

---

## 数据模型

[如果功能涉及数据存储，描述数据模型]

### 数据结构

\\\`\\\`\\\`typescript
interface [ModelName] {
  [field]: [type];
}
\\\`\\\`\\\`

---

## API 设计

[如果功能涉及 API，描述 API 设计]

### 接口定义

| 方法 | 路径 | 描述 |
|------|------|------|
| [GET/POST/...] | [/path] | [描述] |

---

## 文件结构

[描述功能涉及的文件和目录]

\\\`\\\`\\\`
[项目目录]/
├── [新增文件1]
├── [新增文件2]
└── [修改文件]
\\\`\\\`\\\`

### 文件说明

| 文件 | 用途 |
|------|------|
| [文件路径] | [用途说明] |

---

## 依赖关系

### 新增依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| [依赖名] | [版本] | [用途] |

### 内部依赖

- [列出依赖的内部模块]

---

## 设计决策

### 决策 1: [决策标题]

**问题**: [描述面临的问题]

**选项**:
1. [选项 A]: [描述]
2. [选项 B]: [描述]

**决策**: 选择 [选项]

**理由**: [解释选择的理由]

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| [风险描述] | [高/中/低] | [缓解措施] |

---

*设计版本: 1.0.0*
*创建时间: [当前时间]*
\`\`\`

### design.md 编写指南

1. **技术方案**: 基于项目上下文选择合适的技术
2. **架构设计**: 遵循项目现有的架构模式
3. **数据模型**: 如果涉及数据，定义清晰的数据结构
4. **API 设计**: 如果涉及 API，遵循项目的 API 规范
5. **文件结构**: 遵循项目的目录组织方式
6. **设计决策**: 记录重要的技术决策和理由

---

## 📋 生成 tasks.md

在 \`{docs_dir}/specs/{feature_name}/tasks.md\` 中生成以下内容：

\`\`\`markdown
# 任务清单：{feature_name}

## 概述

实现 {feature_name} 功能的任务分解。

---

## 任务列表

### 阶段 1: 准备工作

- [ ] 1.1 [任务标题]
  - [具体操作说明]
  - _需求: [对应的需求编号]_

- [ ] 1.2 [任务标题]
  - [具体操作说明]
  - _需求: [对应的需求编号]_

---

### 阶段 2: 核心实现

- [ ] 2.1 [任务标题]
  - [具体操作说明]
  - _需求: [对应的需求编号]_

- [ ] 2.2 [任务标题]
  - [具体操作说明]
  - 依赖: 任务 2.1
  - _需求: [对应的需求编号]_

---

### 阶段 3: 集成测试

- [ ] 3.1 [任务标题]
  - [具体操作说明]
  - _需求: [对应的需求编号]_

---

## 检查点

- [ ] 阶段 1 完成后：[验证内容]
- [ ] 阶段 2 完成后：[验证内容]
- [ ] 阶段 3 完成后：[验证内容]

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| [文件路径] | 新建/修改 | [说明] |

---

## 依赖任务

- [列出依赖的其他任务或功能]

---

*任务版本: 1.0.0*
*创建时间: [当前时间]*
\`\`\`

### tasks.md 编写指南

1. **任务分阶段**: 按逻辑顺序组织任务
2. **任务粒度**: 每个任务应在 2-4 小时内完成
3. **依赖关系**: 明确标注任务之间的依赖
4. **需求追溯**: 每个任务关联对应的需求
5. **检查点**: 每个阶段结束后有验证点
6. **文件清单**: 列出所有涉及的文件变更

---

## ✅ 检查清单

生成所有文档后，请验证以下内容：

### requirements.md 检查

- [ ] 功能概述清晰描述了功能目的
- [ ] 术语定义完整
- [ ] 每个需求都有用户故事
- [ ] 验收标准使用 EARS 格式
- [ ] 非功能需求已考虑
- [ ] 依赖关系已列出

### design.md 检查

- [ ] 技术选型有明确理由
- [ ] 架构设计符合项目现有架构
- [ ] 数据模型定义清晰（如适用）
- [ ] API 设计完整（如适用）
- [ ] 文件结构清晰
- [ ] 设计决策有记录

### tasks.md 检查

- [ ] 任务分阶段合理
- [ ] 每个任务有明确目标
- [ ] 依赖关系正确
- [ ] 任务关联了需求
- [ ] 检查点完整
- [ ] 文件变更清单完整

### 通用检查

- [ ] 三个文件都已创建
- [ ] 文件路径正确: \`{docs_dir}/specs/{feature_name}/\`
- [ ] 所有占位符已替换
- [ ] Markdown 格式正确
- [ ] 内容与项目上下文一致（如有）

---

## 📌 注意事项

1. **参考项目上下文**: 如果存在 \`{docs_dir}/project-context.md\`，请参考其中的技术栈和架构信息
2. **保持一致性**: 文档风格应与项目现有文档保持一致
3. **需求可测试**: 每个验收标准都应该是可测试的
4. **任务可执行**: 每个任务都应该是具体可执行的
5. **时间格式**: 使用 YYYY-MM-DD HH:mm:ss 格式

---

*指南版本: 1.0.0*
*工具: MCP Probe Kit - add_feature*
`;

/**
 * add_feature 工具实现
 * 
 * @param args - 工具参数
 * @param args.feature_name - 功能名称（必填，kebab-case 格式）
 * @param args.description - 功能描述（必填）
 * @param args.docs_dir - 文档目录，默认 "docs"
 * @returns MCP 响应，包含功能规格生成指南
 */
export async function addFeature(args: any) {
  try {
    // 验证必填参数
    const featureName = args?.feature_name;
    const description = args?.description;

    if (!featureName) {
      throw new Error("缺少必填参数: feature_name（功能名称）");
    }
    if (!description) {
      throw new Error("缺少必填参数: description（功能描述）");
    }

    // 解析可选参数
    const docsDir = args?.docs_dir || DEFAULT_DOCS_DIR;

    // 构建指南文本（替换占位符）
    const guide = PROMPT_TEMPLATE
      .replace(/{feature_name}/g, featureName)
      .replace(/{description}/g, description)
      .replace(/{docs_dir}/g, docsDir);

    // 返回结果
    return {
      content: [
        {
          type: "text",
          text: guide,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ 添加功能失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
