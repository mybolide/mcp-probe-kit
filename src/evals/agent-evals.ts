/**
 * v5 deterministic agent governance evaluations. They assert live SQLite-only
 * routing rather than exercising removed v4 file/delegated-plan templates.
 */
import { V5_DEVC_ACTIONS } from '../devcontrol/model-tool.js';
import { renderV5Skill } from '../lib/v5-sqlite-guidance.js';
import { MCP_APP_RESOURCES, getMcpAppResourceUri } from '../lib/mcp-apps.js';
import { TOOL_CATALOG } from '../server/tool-catalog.js';
import { isV5Tool, V4_PROCESS_TOOLS } from '../server/v5-tool-policy.js';
import type { AgentEvalCaseResult, AgentEvalCategory, AgentEvalReport } from './agent-eval-types.js';

interface Evaluation {
  id: string;
  category: AgentEvalCategory;
  description: string;
  expected: unknown;
  evaluate: () => unknown;
  matches: (value: unknown) => boolean;
}
function equal(value: unknown): boolean { return value === true; }
const checks: Evaluation[] = [
  ...[...V4_PROCESS_TOOLS].map((name): Evaluation => ({
    id: `deny-v4-${name}`, category: 'routing',
    description: `Retired ${name} must not be callable or visible to agents`,
    expected: true, evaluate: () => !isV5Tool(name)
      && !TOOL_CATALOG.some((entry) => entry.name === name)
      && getMcpAppResourceUri(name) === undefined, matches: equal,
  })),
  {
    id: 'sqlite-devcontrol-catalog', category: 'tool-triggering',
    description: 'SQLite DevControl is the sole process-management MCP surface',
    expected: true, evaluate: () => TOOL_CATALOG.some((t) => t.name === 'devcontrol')
      && V5_DEVC_ACTIONS.includes('next') && V5_DEVC_ACTIONS.includes('verify'), matches: equal,
  },
  {
    id: 'no-v4-ui-resources', category: 'tool-triggering',
    description: 'Only DevControl and independent Memory can be shown as MCP Apps',
    expected: true, evaluate: () => MCP_APP_RESOURCES.length === 2
      && MCP_APP_RESOURCES.some((r) => r.kind === 'devcontrol-workbench')
      && MCP_APP_RESOURCES.some((r) => r.kind === 'memory-center'), matches: equal,
  },
  {
    id: 'scoped-project-root', category: 'parameter-construction',
    description: 'v5 guidance requires explicit project_root for SQLite project isolation',
    expected: true, evaluate: () => renderV5Skill('5.0.0').includes('project_root')
      && renderV5Skill('5.0.0').includes('target application Git repository'), matches: equal,
  },
  {
    id: 'owner-review-prerequisite', category: 'plan-compliance',
    description: 'Plan must be independently reviewed and hash-bound approved before claim',
    expected: true, evaluate: () => ['plan-review', 'plan-propose','plan-approve','claim']
      .every((action) => V5_DEVC_ACTIONS.some((candidate) => candidate === action))
      && renderV5Skill('5.0.0').includes('Owner'), matches: equal,
  },
  {
    id: 'real-gates', category: 'plan-compliance',
    description: 'DevControl does not substitute for Agent review and actual tests',
    expected: true, evaluate: () => renderV5Skill('5.0.0').includes('real tests')
      && renderV5Skill('5.0.0').includes('never Verified'), matches: equal,
  },
  {
    id: 'independent-memory', category: 'memory-safety',
    description: 'Memory must not become a second development task authority',
    expected: true, evaluate: () => getMcpAppResourceUri('search_memory')
      === 'ui://mcp-probe-kit/memory-center'
      && renderV5Skill('5.0.0').includes('task state or checkpoint continuity'), matches: equal,
  },
  {
    id: 'project-history-is-sqlite', category: 'memory-safety',
    description: 'History is SQLite-only and legacy Markdown is import-only',
    expected: true, evaluate: () => renderV5Skill('5.0.0').includes('hs_*')
      && renderV5Skill('5.0.0').includes('read-imported once'), matches: equal,
  },
  {
    id: 'reviewed-scope-change', category: 'plan-compliance',
    description: 'Frozen task scope requires reviewed revision and Owner approval',
    expected: true, evaluate: () => ['release-work-scope-independent-review','release-work-scope-approve']
      .every((action) => V5_DEVC_ACTIONS.some((candidate) => candidate === action)), matches: equal,
  },
];

export function runAgentEvals(now: Date = new Date()): AgentEvalReport {
  const cases: AgentEvalCaseResult[] = checks.map((check) => {
    try {
      const actual = check.evaluate();
      return { id: check.id, category: check.category, description: check.description,
        expected: check.expected, actual, passed: check.matches(actual) };
    } catch (error) {
      return { id: check.id, category: check.category, description: check.description,
        expected: check.expected, actual: null, passed: false,
        error: error instanceof Error ? error.message : String(error) };
    }
  });
  const categories = [...new Set(cases.map((item) => item.category))].map((category) => {
    const items = cases.filter((item) => item.category === category);
    const failed = items.filter((item) => !item.passed).length;
    return { category, passed: failed === 0, total: items.length, failed };
  });
  const failed = cases.filter((item) => !item.passed).length;
  return { passed: failed === 0, generatedAt: now.toISOString(),
    totals: { cases: cases.length, passed: cases.length - failed, failed },
    categories, cases };
}
