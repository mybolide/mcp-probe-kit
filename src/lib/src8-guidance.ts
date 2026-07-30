import { SRC8_METHODOLOGY, TBP8_ALIAS } from './src8-core.js';
import { buildSrc8EvidenceFromInput } from './src8-plan.js';

export { SRC8_METHODOLOGY, TBP8_ALIAS } from './src8-core.js';
export {
  buildSrc8DelegatedPlan,
  buildSrc8EvidenceFromInput,
  mergeBugfixOrchestrationPlan,
  renderSrc8PlanSummaryMarkdown,
  resolveAnalysisMode,
} from './src8-plan.js';
export type {
  BuildSrc8DelegatedPlanInput,
  MergeBugfixOrchestrationPlanInput,
  Src8ExecutionPlan,
  Src8ExecutionPlanStep,
  Src8InputEvidence,
} from './src8-plan.js';

/**
 * SRC-8（Software Root-Cause 8-step）
 *
 * 面向软件与 Agent 的真因分析协议，受丰田 TBP（Toyota Business Practice）八步法与 PDCA 启发，
 * 但使用代码世界的语言（复现、分层、贡献因子、测试契约、记忆沉淀）。
 *
 * @see docs/src8-methodology.md
 * @see docs/src8-methodology.zh-CN.md
 */

export type Src8StepId =
  | "clarify_gap"
  | "narrow_boundary"
  | "acceptance_contract"
  | "root_cause"
  | "countermeasures"
  | "implement"
  | "evaluate"
  | "standardize";

export type PdcaPhase = "plan" | "do" | "check" | "act";

export type AttributionLayer =
  | "code"
  | "runtime"
  | "data_contract"
  | "integration"
  | "agent_behavior"
  | "environment";

export const ATTRIBUTION_LAYERS: Array<{ id: AttributionLayer; label: string; hint: string }> = [
  { id: "code", label: "代码", hint: "逻辑/类型/边界/空值" },
  { id: "runtime", label: "运行时", hint: "并发/超时/内存/进程" },
  { id: "data_contract", label: "数据契约", hint: "API/Schema/序列化/缓存" },
  { id: "integration", label: "集成", hint: "第三方/网关/MCP/外部服务" },
  { id: "agent_behavior", label: "Agent 行为", hint: "工具未调/参数空/guidance 当结论/跳步" },
  { id: "environment", label: "环境", hint: "配置/权限/路径/cwd" },
];

export type Src8ChecklistItem = {
  step: number;
  id: Src8StepId;
  title: string;
  pdca: PdcaPhase;
  status: "pending" | "agent_must_complete";
  question: string;
  techniques: string[];
  antiPatterns: string[];
  /** 借鉴自丰田 TBP 的对应步骤（1-8） */
  inspiredByTbpStep: number;
  schemaFields?: string[];
};

export const SRC8_STEPS: Omit<Src8ChecklistItem, "status">[] = [
  {
    step: 1,
    id: "clarify_gap",
    title: "明确差距",
    pdca: "plan",
    inspiredByTbpStep: 1,
    question: "真正目的是什么？理想行为 vs 实际行为？差距如何可观察、可量化？",
    techniques: [
      "理想 / 实际 / 差距（gap）三要素",
      "区分：慢 / 停滞 / 失败 / 回归 / 未生效",
      "纳入期望行为与实际行为",
    ],
    antiPatterns: ["坏了", "卡了", "有问题", "只有情绪没有差距"],
    schemaFields: ["tbp.phenomenon"],
  },
  {
    step: 2,
    id: "narrow_boundary",
    title: "收敛边界",
    pdca: "plan",
    inspiredByTbpStep: 2,
    question: "问题落在哪条链、哪一层？优先调查点（priority point）在哪？",
    techniques: [
      "时间线：何时开始、经过、终止",
      "现码现志：日志、堆栈、复现、读源码、code_insight 图谱",
      "归因层枚举：code / runtime / data_contract / integration / agent_behavior / environment",
    ],
    antiPatterns: ["大问题不分解", "边界模糊", "跨层甩锅"],
    schemaFields: ["tbp.timeline", "tbp.boundary"],
  },
  {
    step: 3,
    id: "acceptance_contract",
    title: "验收契约",
    pdca: "plan",
    inspiredByTbpStep: 3,
    question: "什么叫「修好了」？验收标准是否 SMART？",
    techniques: [
      "优先：failing test → fix → green",
      "或：可重复 repro 命令 / 明确手动步骤",
      "先写验收标准，再进入真因与对策",
    ],
    antiPatterns: ["修好就行", "无验收标准", "改善质量"],
    schemaFields: ["testPlan"],
  },
  {
    step: 4,
    id: "root_cause",
    title: "把握真因",
    pdca: "plan",
    inspiredByTbpStep: 4,
    question: "基于事实（非假设），完成真因工作表：假设→排除→对比→5 Why→因果陈述",
    techniques: [
      "4a 假设清单（2~5 条，含 agent_behavior）",
      "4b 排除矩阵（证据/反证/结论）",
      "4c 对比分叉（成功 vs 失败；无样本写 evidenceGaps）",
      "4d 5 Why 链（≥3 层，每层绑定观察事实）",
      "4e 真因陈述：simple=因果句 | complex=主因+contributingFactors",
    ],
    antiPatterns: ["超时了", "SDK 有 bug", "从 Step 4 跳起", "无对比仍断言", "脑暴代替观察"],
    schemaFields: ["rootCauseAnalysis", "tbp.ruledOut", "tbp.commonPattern", "tbp.rootCauseStatement", "rootCause"],
  },
  {
    step: 5,
    id: "countermeasures",
    title: "制定对策",
    pdca: "plan",
    inspiredByTbpStep: 5,
    question: "最小 patch 能否消除真因？有效性、可行性、副作用？",
    techniques: [
      "countermeasure 针对真因，非症状兜底",
      "评估：有效性 / 可行性 / 回归风险",
      "code judo：最少文件、最少概念",
    ],
    antiPatterns: ["加巡检掩盖根因", "未评估就动手", "夹带重构"],
    schemaFields: ["fixPlan", "tbp.repair"],
  },
  {
    step: 6,
    id: "implement",
    title: "贯彻修复",
    pdca: "do",
    inspiredByTbpStep: 6,
    question: "复现门禁通过后，改动是否仅限 Bug 范围？",
    techniques: [
      "Step 1~5 + 真因工作表闭合后才可改代码",
      "一次只验证一个假设",
      "三次修复仍失败 → 回 Step 2/4 换假设",
    ],
    antiPatterns: ["无复现就改", "连改多处无法归因", "三次失败后盲试"],
    schemaFields: ["fixPlan.steps", "affectedFiles"],
  },
  {
    step: 7,
    id: "evaluate",
    title: "评价双轨",
    pdca: "check",
    inspiredByTbpStep: 7,
    question: "验收契约达成了吗？过程哪步证据不足？",
    techniques: [
      "结果轨：对照 Step 3 验收契约",
      "过程轨：哪步应更早做、哪条假设应更早排除",
      "重跑 repro + 回归测试",
    ],
    antiPatterns: ["未验证就声称修好", "只评结果不评过程"],
    schemaFields: ["summary", "testPlan"],
  },
  {
    step: 8,
    id: "standardize",
    title: "巩固传播",
    pdca: "act",
    inspiredByTbpStep: 8,
    question: "如何防复发？经验如何跨项目复用（yokoten）？",
    techniques: [
      "补回归测试锁定边界",
      "准备记忆候选：【现象】【根因】【修复】【验证】；converge 通过后再写入",
      "同类路径/模块排查",
    ],
    antiPatterns: ["修完即走", "不沉淀记忆", "不补测试"],
    schemaFields: ["preventionMeasures"],
  },
];

export const ROOT_CAUSE_WORKSHEET_GATES = {
  minHypotheses: 2,
  minRuledOutWithEvidence: 2,
  minWhyLevels: 3,
  requireEvidenceGapsIfNoComparison: true,
  blockCountermeasuresIfConfidenceLow: true,
  symptomOnlyPatterns: [/超时/, /SDK.*bug/i, /网络慢/, /返回慢/],
} as const;

export type RootCauseWorksheetSubstep = {
  id: "4a" | "4b" | "4c" | "4d" | "4e";
  title: string;
  status: "agent_must_complete";
  description: string;
};

export function buildSrc8Checklist(): Src8ChecklistItem[] {
  return SRC8_STEPS.map((item) => ({
    ...item,
    status: "agent_must_complete" as const,
  }));
}

export function buildRootCauseWorksheetSubsteps(): RootCauseWorksheetSubstep[] {
  return [
    {
      id: "4a",
      title: "假设清单",
      status: "agent_must_complete",
      description: "列出 2~5 个可能原因；至少 1 条覆盖 agent_behavior 或 attributionLayer",
    },
    {
      id: "4b",
      title: "排除矩阵",
      status: "agent_must_complete",
      description: "每条假设：支持证据、反证、结论（ruled_out | pending | confirmed）",
    },
    {
      id: "4c",
      title: "对比分叉",
      status: "agent_must_complete",
      description: "成功 vs 失败从哪一步分叉；无 success_sample 则写 evidenceGaps",
    },
    {
      id: "4d",
      title: "5 Why 链",
      status: "agent_must_complete",
      description: "≥3 层；每层 observation（事实）→ why → because",
    },
    {
      id: "4e",
      title: "真因陈述",
      status: "agent_must_complete",
      description: "simple：一条因果句 A+B 在 D 下→C；complex：primaryCause + contributingFactors[]",
    },
  ];
}

export function buildRootCauseWorksheet(input: { hasComparisonSample: boolean }) {
  return {
    step: 4,
    title: "把握真因",
    substeps: buildRootCauseWorksheetSubsteps(),
    gates: ROOT_CAUSE_WORKSHEET_GATES,
    agentMustProduce: "rootCauseAnalysis",
    template: {
      mode: null as "simple" | "complex" | null,
      attributionLayer: null as AttributionLayer | null,
      hypotheses: [] as Array<{
        id: string;
        statement: string;
        attributionLayer?: AttributionLayer;
        status: "ruled_out" | "pending" | "confirmed";
        evidence: string[];
        counterEvidence: string[];
      }>,
      forkPoint: null as string | null,
      whyChain: [] as Array<{
        level: number;
        observation: string;
        why: string;
        because: string;
      }>,
      primaryCause: null as string | null,
      contributingFactors: [] as string[],
      rootCauseStatement: null as string | null,
      confidence: null as "high" | "medium" | "low" | null,
      evidenceGaps: input.hasComparisonSample ? [] as string[] : ["需补充：成功/正常样本或对比证据"],
    },
  };
}

export function renderTbpInspirationSection(): string {
  return `## 📚 方法论渊源：借鉴丰田 TBP 八步法

SRC-8 **不是**丰田 TBP 的逐字翻译，而是继承其 **PDCA 科学思维**，并针对**代码 + Agent** 场景升华：

| 丰田 TBP（制造） | SRC-8（软件/Agent） | 我们的亮点 |
|------------------|---------------------|------------|
| 1 明确问题（理想-实际差距） | 1 明确差距 | 期望/实际行为 + 可观察 gap |
| 2 分解问题（现地现物） | 2 收敛边界 | **现码现志** + code_insight 图谱 + **归因六层** |
| 3 设定目标 | 3 验收契约 | **failing test / repro** 作为 SMART 目标 |
| 4 把握真因（5 Why） | 4 把握真因 | **真因工作表**（假设/排除/对比/5Why/陈述）+ 主因/贡献因子 |
| 5 制定对策 | 5 制定对策 | 最小 patch + 三维评估 |
| 6 贯彻实施 | 6 贯彻修复 | **复现门禁** + 三次失败升级 |
| 7 评价结果和过程 | 7 评价双轨 | 结果 + 过程双评 |
| 8 巩固成果（yokoten） | 8 巩固传播 | 回归测试 + **准备记忆候选，Converge 后写入** |

**继承的不变量**（来自 [Toyota TBP](https://artoflean.com/reference/tbp/)）：
- 差距思维、先 Plan 后 Do、禁止跳步、基于事实、对策针对真因、评价后巩固

**我们的升华**：
- 归因层含 **agent_behavior**（工具链/跳步/幻觉修复）
- 复杂 Bug 允许 **contributingFactors**，不强行单因
- MCP **guidance-only**：强制思维顺序，由 Agent 执行与输出`;
}

export function renderSrc8PdcaMap(): string {
  return `## 🔄 SRC-8 与 PDCA

| PDCA | SRC-8 |
|------|-------|
| **Plan** | 1 明确差距 → 2 收敛边界 → 3 验收契约 → **4 把握真因** → 5 制定对策 |
| **Do** | 6 贯彻修复 |
| **Check** | 7 评价双轨 |
| **Act** | 8 巩固传播 |

> Plan 阶段应占约 **60–70%** 精力；**Step 4 真因**是核心（建议占 Plan 的 40–50%）。`;
}

export function renderAttributionLayersMarkdown(): string {
  return `## 🧭 归因层（软件原生，替代制造 4M）

${ATTRIBUTION_LAYERS.map((l) => `- **${l.id}**（${l.label}）：${l.hint}`).join("\n")}`;
}

export function renderRootCauseWorksheetMarkdown(): string {
  const gates = ROOT_CAUSE_WORKSHEET_GATES;
  return `## 🎯 Step 4 真因工作表（SRC-8 核心）

${buildRootCauseWorksheetSubsteps()
  .map((s) => `### ${s.id} ${s.title}\n${s.description}`)
  .join("\n\n")}

### Step 4 硬门禁（未闭合不准进入 Step 5）

- 假设 ≥ ${gates.minHypotheses} 条；排除（含证据）≥ ${gates.minRuledOutWithEvidence} 条
- 5 Why ≥ ${gates.minWhyLevels} 层，每层绑定观察事实
- 无成功样本时 **必须** 填写 \`evidenceGaps\`
- \`confidence: low\` 时须补证据或 \`code_insight\`，不得直接改代码
- 因果句不得仅以「超时 / SDK bug / 网络慢」敷衍（须分解到可归因层）

### Step 4 输出 JSON 模板

\`\`\`json
{
  "rootCauseAnalysis": {
    "mode": "simple|complex",
    "attributionLayer": "code|runtime|data_contract|integration|agent_behavior|environment",
    "hypotheses": [
      {
        "id": "H1",
        "statement": "假设描述",
        "attributionLayer": "agent_behavior",
        "status": "ruled_out|pending|confirmed",
        "evidence": ["支持证据"],
        "counterEvidence": ["反证"]
      }
    ],
    "forkPoint": "成功在 X 步通过，失败在 Y 步偏离",
    "whyChain": [
      { "level": 1, "observation": "观察到的事实", "why": "为什么", "because": "因为..." }
    ],
    "primaryCause": "复杂场景主因",
    "contributingFactors": ["贡献因子1"],
    "rootCauseStatement": "A + B 在条件 D 下导致 C",
    "confidence": "high|medium|low",
    "evidenceGaps": ["尚缺证据"]
  }
}
\`\`\``;
}

/** Agent 用：可执行清单，不含 TBP 渊源长文（详见 docs/src8-methodology*.md） */
export function renderSrc8AgentChecklistMarkdown(): string {
  return SRC8_STEPS.map((item) => {
    const lines = [
      `### SRC-${item.step} ${item.title}（${item.pdca.toUpperCase()}）`,
      "",
      `**核心问题**：${item.question}`,
      "",
      `**技法**：${item.techniques.map((t) => `- ${t}`).join("\n")}`,
      "",
      `**反模式**：${item.antiPatterns.map((p) => `「${p}」`).join("、")}`,
    ];
    if (item.schemaFields?.length) {
      lines.push("", `**输出字段**：\`${item.schemaFields.join("`, `")}\``);
    }
    return lines.join("\n");
  }).join("\n\n");
}

/** 文档/完整版：含 TBP 步骤对照标注 */
export function renderSrc8ChecklistMarkdown(): string {
  return SRC8_STEPS.map((item) => {
    const lines = [
      `### SRC-${item.step} ${item.title}（${item.pdca.toUpperCase()}｜借鉴 TBP Step ${item.inspiredByTbpStep}）`,
      "",
      `**核心问题**：${item.question}`,
      "",
      `**技法**：${item.techniques.map((t) => `- ${t}`).join("\n")}`,
      "",
      `**反模式**：${item.antiPatterns.map((p) => `「${p}」`).join("、")}`,
    ];
    if (item.schemaFields?.length) {
      lines.push("", `**输出字段**：\`${item.schemaFields.join("`, `")}\``);
    }
    return lines.join("\n");
  }).join("\n\n");
}

export function renderSrc8GateRules(): string {
  return `## 🚧 SRC-8 硬门禁

1. **禁止从 Step 4 跳起** — 须先完成 Step 1~3
2. **Step 4 真因工作表闭合前** — 禁止进入 Step 5/6（不改代码）
3. **Step 4 子步 4a~4e 均须由 Agent 填写** — 见 rootCauseWorksheet
4. **Step 6 前须满足复现门禁** — failing test / repro / 或说明不可复现的技术原因
5. **三次修复仍失败** — 回 Step 2/4，不得盲试
6. **Step 8 须准备记忆候选** — 【现象】【根因】【修复】【验证】；只有 converge 通过后才调用 memorize_asset`;
}

export function renderReproductionGate(): string {
  return `## 🧪 复现门禁（Step 6 前）

1. **failing test**（首选）
2. **failing command**
3. **manual repro + 证据**（日志/堆栈）

不可本地复现须说明**技术原因**（生产数据、第三方状态等），不得以省事跳过。`;
}

export function renderSrc8AgentOutputFormat(): string {
  return `## 📤 Agent 必须输出的 BugAnalysis JSON

\`\`\`json
{
  "summary": "Bug 简述",
  "analysisMode": "src8",
  "rootCause": "Step 4 真因摘要",
  "rootCauseAnalysis": { "...": "见 Step 4 模板" },
  "fixPlan": { "steps": ["Step 5~6"] },
  "testPlan": { "unitTests": ["Step 3 契约"], "manualTests": ["原复现"] },
  "preventionMeasures": ["Step 8"],
  "tbp": {
    "phenomenon": "SRC-1",
    "timeline": [],
    "ruledOut": ["SRC-4 已排除"],
    "commonPattern": "SRC-4 分叉点",
    "boundary": "SRC-2 边界",
    "rootCauseStatement": "SRC-4e",
    "evidence": [],
    "repair": []
  }
}
\`\`\`

> 字段 \`tbp\` 为历史兼容名，语义对齐 SRC-8 各步产出。`;
}

// --- 向后兼容导出（旧模块名 tbp8-guidance） ---
export const TBP8_STEPS = SRC8_STEPS;
export type TbpStepId = Src8StepId;
export type TbpChecklistItem = Src8ChecklistItem;
export const buildTbpChecklist = buildSrc8Checklist;
export const buildTbpEvidenceFromInput = buildSrc8EvidenceFromInput;
export const renderTbpPdcaMap = renderSrc8PdcaMap;
export const renderTbpChecklistMarkdown = renderSrc8ChecklistMarkdown;
export const renderTbpGateRules = renderSrc8GateRules;
export const renderTbpReproductionGate = renderReproductionGate;
export const renderTbpAgentOutputFormat = renderSrc8AgentOutputFormat;
export const renderTbpFiveWhyTemplate = () => renderRootCauseWorksheetMarkdown();
