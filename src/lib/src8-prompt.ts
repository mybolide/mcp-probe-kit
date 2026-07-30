import {
  renderReproductionGate,
  renderRootCauseWorksheetMarkdown,
  renderSrc8GateRules,
} from './src8-guidance.js';
import {
  renderSrc8PlanSummaryMarkdown,
  type Src8ExecutionPlan,
} from './src8-plan.js';

export function renderFixBugAgentPromptBody(sections: {
  error_message: string;
  stack_trace_section: string;
  reproduce_section: string;
  behavior_section: string;
  comparison_section: string;
  verification_target_section: string;
  code_context_section: string;
  plan: Src8ExecutionPlan;
}): string {
  return `# SRC-8 Bug 真因分析与修复

## 🐛 Bug 信息

**错误信息**:
\`\`\`
${sections.error_message}
\`\`\`

${sections.stack_trace_section}

${sections.reproduce_section}

${sections.behavior_section}

${sections.comparison_section}

${sections.verification_target_section}

${sections.code_context_section}

---

${renderSrc8PlanSummaryMarkdown(sections.plan)}

---

${renderRootCauseWorksheetMarkdown()}

---

${renderReproductionGate()}

---

${renderSrc8GateRules()}

*方法论: SRC-8 | 执行: metadata.plan*`;
}

/** @deprecated 使用 renderFixBugAgentPromptBody；完整 TBP 对照版见 docs */
export function renderFixBugPromptBody(
  sections: Parameters<typeof renderFixBugAgentPromptBody>[0]
): string {
  return renderFixBugAgentPromptBody(sections);
}
