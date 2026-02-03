# 如何开发

> 本文档描述 MCP Probe Kit 的开发新工具的基本步骤。

## 概述

本文档介绍如何在 MCP Probe Kit 中添加新工具。开发流程包括：定义 Schema → 实现工具逻辑 → 注册到服务器 → 测试验证。

## 开发新工具的步骤

### 第一步：定义工具 Schema

在 `src/schemas/` 目录下创建或编辑 Schema 文件，定义工具的输入参数和描述。

**示例** - 添加 Git 工作报告工具 Schema (`src/schemas/git-tools.ts`):

```typescript
export const gitWorkReportSchema: Tool = {
  name: "git_work_report",
  description: `基于 Git diff 分析生成工作报告（日报/周期报）

核心功能：
- 支持日报模式（单个日期）和周期报模式（日期范围）
- 自动读取指定日期的所有 Git 提交
- 对每个提交执行 git show 获取完整 diff
- 使用 AI 分析 diff 内容提取实际工作内容

输出格式：
- 只输出「工作内容」部分
- 每条以 - 开头，中文，简洁专业
- 格式：做了什么 + 改了哪里/达到什么效果
- 不输出：提交哈希、文件列表、统计数据、风险总结

使用示例：
- 日报：git_work_report --date 2026-1-27
- 周期报：git_work_report --start_date 2026-2-1 --end_date 2026-2-6`,
  inputSchema: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "单个日期，格式 YYYY-MM-DD（日报模式）",
      },
      start_date: {
        type: "string",
        description: "起始日期，格式 YYYY-MM-DD（周期报模式）",
      },
      end_date: {
        type: "string",
        description: "结束日期，格式 YYYY-MM-DD（周期报模式）",
      },
      output_file: {
        type: "string",
        description: "可选，输出文件路径",
      },
    },
  },
};
```

**关键点：**
- `name` - 工具名称（使用 snake_case）
- `description` - 详细描述工具功能、使用场景、输出格式
- `inputSchema` - JSON Schema 格式的参数定义

### 第二步：实现工具逻辑

在 `src/tools/` 目录下创建工具实现文件。

**示例** - 实现 Git 工作报告工具 (`src/tools/git_work_report.ts`):

```typescript
import { exec } from "child_process";
import { promisify } from "util";
import { formatResponse } from "../lib/response.js";

const execAsync = promisify(exec);

interface GitWorkReportArgs {
  date?: string;
  start_date?: string;
  end_date?: string;
  output_file?: string;
}

export async function gitWorkReport(args: GitWorkReportArgs) {
  try {
    // 1. 参数验证
    const isDaily = !!args.date;
    const isPeriod = !!(args.start_date && args.end_date);
    
    if (!isDaily && !isPeriod) {
      throw new Error("请提供 date（日报）或 start_date + end_date（周期报）");
    }

    // 2. 构建 git log 命令
    let gitCommand: string;
    if (isDaily) {
      gitCommand = `git log --since="${args.date} 00:00:00" --until="${args.date} 23:59:59" --format=%H`;
    } else {
      gitCommand = `git log --since="${args.start_date} 00:00:00" --until="${args.end_date} 23:59:59" --format=%H`;
    }

    // 3. 获取提交列表
    const { stdout: commits } = await execAsync(gitCommand);
    const commitList = commits.trim().split('\n').filter(Boolean);

    if (commitList.length === 0) {
      const message = "- 当日无代码提交（Git 无 commit 记录）";
      return formatResponse(message);
    }

    // 4. 获取每个提交的 diff
    const diffPromises = commitList.map(async (hash) => {
      const { stdout } = await execAsync(`git show ${hash}`);
      return stdout;
    });
    const diffs = await Promise.all(diffPromises);

    // 5. 构建 AI 分析提示
    const analysisPrompt = `
请分析以下 Git diff 内容，提取实际工作内容：

${diffs.join('\n\n---\n\n')}

要求：
- 只输出「工作内容」部分
- 每条以 - 开头
- 中文，简洁专业，避免空话
- 格式：做了什么 + 改了哪里/达到什么效果
- 不输出：提交哈希、文件列表原文、统计数据、风险评估、总结段落
`;

    // 6. 返回结果（AI 会基于此提示生成报告）
    return formatResponse(analysisPrompt);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return formatResponse(`错误: ${errorMessage}`, true);
  }
}
```

**关键点：**
- 使用 TypeScript 类型定义参数
- 使用 `formatResponse` 统一格式化输出
- 错误处理要完善
- 返回的内容应该是 AI 可以理解和处理的

### 第三步：导出工具

在 `src/tools/index.ts` 中导出新工具：

```typescript
export { gitWorkReport } from "./git_work_report.js";
```

在 `src/schemas/index.ts` 中导出 Schema：

```typescript
import { gitWorkReportSchema } from "./git-tools.js";

export const allToolSchemas: Tool[] = [
  // ... 其他工具
  gitWorkReportSchema,
];
```

### 第四步：注册到 MCP 服务器

在 `src/index.ts` 中添加工具路由：

```typescript
import { gitWorkReport } from "./tools/index.js";

// 在 CallToolRequestSchema 处理器中添加
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ... 其他工具
      case "git_work_report":
        return await gitWorkReport(args as any);
      default:
        throw new Error(`未知工具: ${name}`);
    }
  } catch (error) {
    // 错误处理
  }
});
```

### 第五步：测试工具

#### 本地测试

```bash
# 编译代码
npm run build

# 使用 MCP Inspector 测试
npm run inspector
```

在 Inspector 中：
1. 连接到服务器
2. 查看工具列表，确认新工具已注册
3. 调用工具，测试各种参数组合
4. 验证输出格式是否正确

#### 单元测试

在 `src/tools/__tests__/` 创建测试文件：

```typescript
import { describe, it, expect } from 'vitest';
import { gitWorkReport } from '../git_work_report.js';

describe('gitWorkReport', () => {
  it('应该在无提交时返回提示', async () => {
    const result = await gitWorkReport({ date: '2020-01-01' });
    expect(result.content[0].text).toContain('当日无代码提交');
  });

  it('应该验证参数', async () => {
    const result = await gitWorkReport({});
    expect(result.content[0].text).toContain('请提供');
  });
});
```

运行测试：

```bash
npm test
```

### 第六步：更新文档

1. 在 `docs/data/tools.js` 中添加工具信息
2. 更新 `README.md` 中的工具列表
3. 在 `docs/pages/all-tools.html` 中添加工具说明

## 开发编排工具

编排工具（`start_*`）需要返回委托式执行计划。

**示例** - 简化的编排工具结构：

```typescript
export async function startGitReport(args: any) {
  // 1. 生成执行计划
  const plan = {
    mode: "delegated",
    steps: [
      {
        id: "check_context",
        tool: "init_project_context",
        args: {},
        outputs: ["docs/project-context.md"],
      },
      {
        id: "generate_report",
        tool: "git_work_report",
        args: {
          date: args.date,
          start_date: args.start_date,
          end_date: args.end_date,
        },
        outputs: ["work-report.md"],
      },
    ],
  };

  // 2. 返回结构化输出
  return {
    content: [
      {
        type: "text",
        text: "执行计划已生成，请按步骤调用工具",
      },
    ],
    structuredContent: {
      summary: "Git 工作报告生成编排",
      status: "pending",
      metadata: {
        plan,
      },
    },
  };
}
```

## 最佳实践

1. **参数验证** - 在工具开始时验证所有必需参数
2. **错误处理** - 使用 try-catch 捕获所有错误
3. **类型安全** - 使用 TypeScript 类型定义
4. **统一格式** - 使用 `formatResponse` 格式化输出
5. **结构化输出** - 编排工具返回 `structuredContent`
6. **文档完善** - Schema 的 description 要详细清晰
7. **测试覆盖** - 编写单元测试验证功能

## 调试技巧

1. **使用 console.error** - 在服务器端输出调试信息
2. **MCP Inspector** - 可视化测试工具调用
3. **查看日志** - 客户端通常有开发者工具可查看 MCP 通信
4. **单步调试** - 使用 VS Code 调试 TypeScript 代码

---
*返回索引: [../project-context.md](../project-context.md)*
