/**
 * Single source of truth for generated AGENTS.md: v5 SQLite DevControl.
 * Do not reintroduce v4 workflow/resume_plan/heartbeat implementations or
 * copy the full guidance here. Update v5-sqlite-guidance.ts instead and
 * regenerate Skill + AGENTS + CLAUDE/IDE adapters together, with tests.
 */
import type { DocumentLocale, ProjectContextLayout } from './project-context-layout.js';
import { relativeLink } from './project-context-layout.js';
import {
  formatAgentsSkillReference,
  formatAgentsSkillReferenceEn,
} from './agents-skill-ref.js';
import { MCP_PROBE_SKILL_REL_PATH } from './workflow-skill-template.js';
import { renderV5AgentsMd } from './v5-sqlite-guidance.js';

export interface AgentsMdTemplateInput {
  layout: ProjectContextLayout;
  locale: DocumentLocale;
  projectName: string;
  projectVersion: string;
  description: string;
  language: string;
  framework?: string;
  category: string;
  docs: Array<{ file: string; title: string; purpose: string }>;
  projectRootPosix: string;
  graphReady: boolean;
  contextReady?: boolean;
  /** @deprecated Kept for callers; v5 History and tool rules are fixed. */
  memoryEnabled?: boolean;
}

export function generateAgentsMdInner(input: AgentsMdTemplateInput): string {
  const skillLink=relativeLink(input.layout.indexPath,MCP_PROBE_SKILL_REL_PATH);
  return renderV5AgentsMd(input.locale,input.locale==='zh-CN'
    ?formatAgentsSkillReference(skillLink)
    :formatAgentsSkillReferenceEn(skillLink));
}

export function generateAgentsMdTemplate(input: AgentsMdTemplateInput): string {
  return generateAgentsMdInner(input);
}
