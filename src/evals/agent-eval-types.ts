export type AgentEvalCategory =
  | 'routing'
  | 'parameter-construction'
  | 'plan-compliance'
  | 'memory-safety'
  | 'tool-triggering';

export interface AgentEvalCaseResult {
  id: string;
  category: AgentEvalCategory;
  description: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  error?: string;
}

export interface AgentEvalCategoryResult {
  category: AgentEvalCategory;
  passed: boolean;
  total: number;
  failed: number;
}

export interface AgentEvalReport {
  passed: boolean;
  generatedAt: string;
  totals: {
    cases: number;
    passed: number;
    failed: number;
  };
  categories: AgentEvalCategoryResult[];
  cases: AgentEvalCaseResult[];
}
