/**
 * fix_bug 工具
 *
 * 功能：基于 TBP 8 步法输出真因分析与修复指南
 * 模式：指令生成器模式 - 返回详细的 RCA 与修复指南，由 AI 执行实际操作
 *
 * 流程：定义现象 → 复盘时间线 → 排除错误方向 → 找共同模式 → 定位边界 → 陈述真因 → 闭合证据链 → 设计修复方案
 */

import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import { handleToolError } from "../utils/error-handler.js";
import type { BugAnalysis } from "../schemas/output/core-tools.js";

const PROMPT_TEMPLATE = `# TBP 8 步 Bug 真因分析与修复指南

## 🐛 Bug 信息

**错误信息**:
\`\`\`
{error_message}
\`\`\`

{stack_trace_section}

{reproduce_section}

{behavior_section}

{code_context_section}

---

## TBP-1 现象

先把用户可见的问题定义准确，避免“坏了/卡了/有问题”这类泛化描述。

要求：
1. 用 1-2 句定义现象
2. 明确是“慢”“停滞”“失败”“回归”还是“未生效”
3. 如果提供了期望/实际行为，必须纳入现象定义

## TBP-2 时间线

基于现有信息复盘事件顺序，至少回答：
1. 什么时候开始
2. 中间发生了什么
3. 最后停在什么状态

优先记录：
- 用户输入 / 复现步骤
- first progress / first error
- tool call / stack / stop / timeout
- 关键文件或模块

## TBP-3 不是这个

列出当前应优先排除的错误方向，并说明需要什么证据排除。

常见排除项：
- 不是单纯网络慢
- 不是前端展示截断
- 不是消息没转发
- 不是纯粹的超时表象
- 不是用户输入丢失

## TBP-4 共同模式

对比成功/失败样本，找出从哪一步开始分叉。

重点检查：
- 传输层
- 会话状态机
- 完成态判定
- 工具执行
- 文件写入
- 重试策略

## TBP-5 边界

明确指出问题失控落在哪一层：
- 上游模型 / SDK
- 网关状态机
- session 复用
- tool 执行层
- 文件系统
- 环境配置
- UI 展示层

## TBP-6 真因

真因必须写成因果句：
\`A + B 在条件 D 下导致了 C\`

不允许只写：
- 超时了
- SDK 有 bug
- 返回慢

## TBP-7 证据链

说明：
1. 哪些证据支持真因
2. 哪些现象若出现会推翻它，但现场没有出现
3. 为什么其他解释更弱

## TBP-8 修复

只有在证据链闭合后，才开始设计修复。

每个修复方案都要说明：
- 改哪一层
- 为什么这是修真因，不是补症状
- 风险是什么
- 怎么验证

---

## 📤 输出格式要求

请严格按以下 JSON 格式输出修复指南：

\`\`\`json
{
  "bug_summary": "Bug 简述（一句话）",
  "analysis_mode": "tbp8",
  "analysis": {
    "error_type": "错误类型",
    "direct_cause": "直接原因",
    "root_cause": "根本原因",
    "affected_scope": "影响范围"
  },
  "tbp": {
    "phenomenon": "TBP-1 现象",
    "timeline": [],
    "ruled_out": [],
    "common_pattern": "TBP-4 共同模式",
    "boundary": "TBP-5 边界",
    "root_cause_statement": "A + B 在条件 D 下导致 C",
    "evidence": [],
    "repair": []
  },
  "location": {
    "file": "问题文件路径",
    "line": 42,
    "function": "问题函数名",
    "code_snippet": "问题代码片段"
  },
  "fix_plan": {
    "chosen_solution": "选择的修复方案",
    "reason": "选择理由",
    "steps": [
      { "step": 1, "action": "修复步骤", "file": "文件", "change": "变更内容" }
    ],
    "code_before": "修改前代码",
    "code_after": "修改后代码"
  },
  "verification": {
    "test_cases": ["测试用例1", "测试用例2"],
    "manual_checks": ["手动验证项1", "手动验证项2"]
  }
}
\`\`\`

## ⚠️ 护栏

- 不要一看到新现象就补一个新分支，先判断是不是同一类根因在换表现
- 不要把“超时”直接当真因，要先分清是没进展、慢进展，还是结果已出现但判定过严
- 不要只看单一样本就下结论，有对比样本时必须做对比
- 如果证据不足，要明确说明还缺什么证据

---

*指南版本: 2.0.0*
*工具: MCP Probe Kit - fix_bug*
`;

function inferBugType(text: string): BugAnalysis["bugType"] {
  if (/timeout|latency|slow|卡|慢|超时/i.test(text)) return "performance";
  if (/auth|permission|unauthor|token|登录|权限/i.test(text)) return "security";
  if (/ui|render|white screen|白屏|按钮|页面/i.test(text)) return "ui";
  if (/sql|db|data|schema|缓存|数据/i.test(text)) return "data";
  if (/api|request|network|gateway|integration|调用失败/i.test(text)) return "integration";
  return "functional";
}

function inferSeverity(text: string): BugAnalysis["severity"] {
  if (/crash|fatal|panic|生产故障|数据丢失|security|权限绕过/i.test(text)) return "critical";
  if (/white screen|白屏|500|无法登录|阻塞|不可用|timeout|超时/i.test(text)) return "high";
  if (/error|exception|失败|异常/i.test(text)) return "medium";
  return "low";
}

function extractFilePaths(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/[A-Za-z]:[\\/][^:\n\r\t]+|(?:src|app|lib|server|client|docs)[\\/][^:\n\r\t)]+/g) || [];
  return Array.from(new Set(matches.map((item) => item.replace(/\\/g, "/")))).slice(0, 8);
}

function summarizePhenomenon(errorMessage: string, expectedBehavior: string, actualBehavior: string): string {
  if (expectedBehavior || actualBehavior) {
    return `实际表现为“${actualBehavior || errorMessage}”，但期望是“${expectedBehavior || "保持正常行为"}”。`;
  }
  return `当前可见现象是“${errorMessage}”，需要先区分它属于失败、停滞、未生效还是性能退化。`;
}

/**
 * fix_bug 工具实现
 */
export async function fixBug(args: any) {
  try {
    const parsedArgs = parseArgs<{
      error_message?: string;
      stack_trace?: string;
      code_context?: string;
      analysis_mode?: string;
      steps_to_reproduce?: string;
      expected_behavior?: string;
      actual_behavior?: string;
    }>(args, {
      defaultValues: {
        error_message: "",
        stack_trace: "",
        code_context: "",
        analysis_mode: "tbp8",
        steps_to_reproduce: "",
        expected_behavior: "",
        actual_behavior: "",
      },
      primaryField: "error_message",
      fieldAliases: {
        error_message: ["error", "err", "message", "错误", "错误信息"],
        stack_trace: ["stack", "trace", "堆栈", "调用栈"],
        code_context: ["code_context", "code", "context", "相关代码", "代码上下文"],
        analysis_mode: ["analysis_mode", "methodology", "tbp", "rca", "分析方法"],
        steps_to_reproduce: ["steps", "reproduce", "步骤", "复现步骤"],
        expected_behavior: ["expected", "期望", "期望行为"],
        actual_behavior: ["actual", "实际", "实际行为"],
      },
    });

    const errorMessage = getString(parsedArgs.error_message);
    const stackTrace = getString(parsedArgs.stack_trace);
    const codeContext = getString(parsedArgs.code_context);
    const analysisMode: BugAnalysis["analysisMode"] = (getString(parsedArgs.analysis_mode) || "tbp8").toLowerCase() === "tbp8"
      ? "tbp8"
      : "tbp8";
    const stepsToReproduce = getString(parsedArgs.steps_to_reproduce);
    const expectedBehavior = getString(parsedArgs.expected_behavior);
    const actualBehavior = getString(parsedArgs.actual_behavior);

    if (!errorMessage) {
      throw new Error("缺少必填参数: error_message（错误信息）");
    }

    const stackTraceSection = stackTrace
      ? `**堆栈跟踪**:\n\`\`\`\n${stackTrace}\n\`\`\``
      : "**堆栈跟踪**: 未提供（建议提供以便更准确定位）";

    const reproduceSection = stepsToReproduce
      ? `**复现步骤**:\n${stepsToReproduce}`
      : "";

    const behaviorSection = [expectedBehavior ? `**期望行为**: ${expectedBehavior}` : "", actualBehavior ? `**实际行为**: ${actualBehavior}` : ""]
      .filter(Boolean)
      .join("\n\n");

    const codeContextSection = codeContext
      ? `**代码/图谱上下文**:\n\`\`\`\n${codeContext}\n\`\`\``
      : "";

    const header = renderGuidanceHeader({
      tool: "fix_bug",
      goal: "基于 TBP 8 步法分析 Bug 真因，并提供修复指南。AI 应根据指南执行实际修复。",
      tasks: ["先定义现象并复盘时间线", "闭合证据链后形成真因", "输出修复步骤与验证方案"],
      outputs: ["TBP 真因分析指南", "结构化 RCA 数据"],
    });

    const guide = `${header}${PROMPT_TEMPLATE
      .replace(/{error_message}/g, errorMessage)
      .replace(/{stack_trace_section}/g, stackTraceSection)
      .replace(/{reproduce_section}/g, reproduceSection)
      .replace(/{behavior_section}/g, behaviorSection)
      .replace(/{code_context_section}/g, codeContextSection)}`;

    const evidence = [
      { type: "symptom" as const, detail: errorMessage, source: "error_message" },
      ...(stepsToReproduce ? [{ type: "timeline" as const, detail: stepsToReproduce, source: "steps_to_reproduce" }] : []),
      ...(stackTrace ? [{ type: "stack" as const, detail: stackTrace, source: "stack_trace" }] : []),
      ...(codeContext ? [{ type: "code" as const, detail: codeContext, source: "code_context" }] : []),
      ...(expectedBehavior ? [{ type: "comparison" as const, detail: `期望行为: ${expectedBehavior}`, source: "expected_behavior" }] : []),
      ...(actualBehavior ? [{ type: "comparison" as const, detail: `实际行为: ${actualBehavior}`, source: "actual_behavior" }] : []),
    ];

    const affectedFiles = [...extractFilePaths(stackTrace), ...extractFilePaths(codeContext)]
      .filter((value, index, array) => array.indexOf(value) === index);

    const structuredData: BugAnalysis = {
      summary: `TBP 8 步真因分析：${errorMessage.substring(0, 60)}${errorMessage.length > 60 ? "..." : ""}`,
      bugType: inferBugType([errorMessage, actualBehavior, codeContext].filter(Boolean).join("\n")),
      severity: inferSeverity([errorMessage, actualBehavior].filter(Boolean).join("\n")),
      analysisMode,
      rootCause: "待通过 TBP-6 真因分析确认；在证据链闭合前不直接给出确定性修复结论。",
      affectedComponents: affectedFiles.length > 0 ? affectedFiles.map((item) => item.split("/").slice(0, -1).join("/") || item) : [],
      affectedFiles,
      fixPlan: {
        steps: [
          "先完成 TBP-1：精确定义现象，避免泛化描述",
          "完成 TBP-2 时间线，明确开始、经过、终止状态",
          "完成 TBP-3 与 TBP-4，排除错误方向并对比成功/失败样本",
          "在 TBP-5/6 确认问题边界与因果句真因后，再修改代码",
        ],
        estimatedTime: "30-90 分钟（取决于证据完整度）",
        risks: [
          "如果跳过 TBP 1-7，容易只修表象不修真因",
          "如果没有成功样本对比，TBP-4 共同模式结论可能偏弱",
        ],
      },
      testPlan: {
        unitTests: ["覆盖触发 Bug 的最小输入场景", "覆盖修复后的边界条件"],
        integrationTests: ["覆盖完整调用链或关键交互路径"],
        manualTests: ["按原复现步骤再次验证", "验证成功样本与失败样本分叉点已消失"],
      },
      preventionMeasures: [
        "补充针对该边界条件的自动化测试",
        "把关键状态与错误上下文写入日志，便于 TBP-2 时间线复盘",
        "对完成态判定、文件写入、重试等边界增加显式校验",
      ],
      tbp: {
        phenomenon: summarizePhenomenon(errorMessage, expectedBehavior, actualBehavior),
        timeline: [
          { order: 1, event: "收到问题现象", evidence: errorMessage },
          ...(stepsToReproduce ? [{ order: 2, event: "获得复现步骤", evidence: stepsToReproduce }] : []),
          ...(stackTrace ? [{ order: 3, event: "获得堆栈或错误栈", evidence: stackTrace }] : []),
          ...(codeContext ? [{ order: 4, event: "获得代码/图谱上下文", evidence: codeContext }] : []),
        ],
        ruledOut: [
          "尚不能直接归因于“纯超时”或“SDK 有 bug”，需要先完成时间线与边界分析",
          "尚不能直接归因于“网络慢”，除非有传输层证据支持",
        ],
        commonPattern: "优先比较成功与失败样本，从调用链、状态机、工具执行、文件写入等维度找分叉点。",
        boundary: "待定位；默认优先排查工具执行层、状态机、文件写入层和环境配置层。",
        rootCauseStatement: "待形成 “A + B 在条件 D 下导致 C” 的因果句；在证据闭环前不下最终结论。",
        evidence,
        repair: [
          {
            layer: "analysis",
            action: "先补齐现象、时间线、对比样本和边界信息，再进入代码修复",
            risk: "证据不足时过早修复，可能导致重复返工",
            verification: "确认 TBP-7 证据链能解释全部关键现象",
          },
          {
            layer: "implementation",
            action: "只修改真因所在层，不以“兜底分支”替代根因修复",
            risk: "补症状会掩盖真正失控边界",
            verification: "验证原问题消失且未引入新的回归",
          },
        ],
      },
    };

    return okStructured(guide, structuredData, {
      schema: (await import("../schemas/output/core-tools.js")).BugAnalysisSchema,
      note: "本工具默认采用 TBP 8 步法输出真因分析与修复指南，AI 应先完成证据闭环，再执行代码修复和验证测试",
    });
  } catch (error) {
    return handleToolError(error, "fix_bug");
  }
}
