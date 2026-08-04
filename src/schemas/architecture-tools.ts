export const architectureToolSchemas = [
  {
    name: 'architecture',
    description:
      '独立架构领域能力，使用 ARC-8 完成架构评估、设计、校验和漂移检查。可直接调用，也可由功能、Bug 或重构流程按需组合；MCP 负责方法、门禁与结构化证据，不替 Agent 声称绝对最优架构。',
    inputSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['assess', 'design', 'validate', 'drift'],
          description: 'ARC-8 入口阶段：assess、design、validate 或 drift，默认 assess',
        },
        description: {
          type: 'string',
          description: '本次架构任务的完整目标，不能只传“继续”或“优化架构”',
        },
        project_root: {
          type: 'string',
          description: '目标项目根目录绝对路径',
        },
        scope: {
          type: 'array',
          items: { type: 'string' },
          description: '涉及模块、目录、服务或数据域',
        },
        constraints: {
          type: 'array',
          items: { type: 'string' },
          description: '已确认的业务与技术约束',
        },
        non_goals: {
          type: 'array',
          items: { type: 'string' },
          description: '本次明确不处理的内容',
        },
        baseline: {
          description: '已有 assess 结果、ADR、ArchitectureCandidate、Plan 或设计证据；可传对象或 JSON/文本',
        },
        current_facts: {
          type: 'array',
          description: '当前架构事实，需标记 fact/inference/unknown',
          items: {
            type: 'object',
            properties: {
              statement: { type: 'string' },
              classification: { type: 'string', enum: ['fact', 'inference', 'unknown'] },
              evidence: { type: 'array', items: { type: 'string' } },
            },
            required: ['statement'],
          },
        },
        structural_causes: { type: 'array', items: { type: 'string' } },
        protected_invariants: { type: 'array', items: { type: 'string' } },
        alternatives: { type: 'array', items: { type: 'object' } },
        decision: { type: 'object' },
        target_architecture: { type: 'object' },
        transition_plan: { type: 'object' },
        diff: {
          type: 'string',
          description: 'validate/drift 使用的真实 Git diff、revision 摘要或实现证据',
        },
        runtime_evidence: {
          type: 'array',
          items: { type: 'string' },
          description: '运行结果、图谱摘要、日志、指标或验收证据',
        },
        observed_drift: {
          type: 'array',
          items: { type: 'string' },
          description: 'Agent 已确认的架构偏移事实',
        },
        save_to_docs: {
          type: 'boolean',
          description: '是否返回架构文档 delegated 落盘计划；工具本身不直接重写项目文档',
        },
      },
      required: ['description'],
      additionalProperties: true,
    },
  },
] as const;
