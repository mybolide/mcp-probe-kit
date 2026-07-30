const evidenceSchema = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: ['requirements', 'spec', 'implementation', 'test', 'review', 'memory', 'other'],
    },
    summary: { type: 'string' },
    step_id: { type: 'string' },
    reference: { type: 'string' },
    revision: { type: 'string' },
    verified_at: { type: 'string' },
  },
  required: ['kind', 'summary'],
  additionalProperties: true,
} as const;

export const planToolSchemas = [
  {
    name: 'plan_heartbeat',
    description:
      '由 Agent 在 Delegated Plan 执行过程中记录轻量检查点。首次调用必须提供完整 plan；后续合并完成步骤、证据、未决事项和已验证 revision。只记录状态，不代替 Agent 执行。',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string', description: 'Delegated Plan 的稳定 planId' },
        project_root: { type: 'string', description: '项目根目录；省略时按工作区解析' },
        plan: { type: 'object', description: '首次 heartbeat 必填的完整 Delegated Plan Contract', additionalProperties: true },
        status: { type: 'string', enum: ['active', 'blocked', 'cancelled'] },
        current_step_id: { type: 'string' },
        completed_step_ids: { type: 'array', items: { type: 'string' } },
        skipped_steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              step_id: { type: 'string' },
              reason: { type: 'string' },
            },
            required: ['step_id', 'reason'],
          },
        },
        unresolved_items: { type: 'array', items: { type: 'string' } },
        evidence: { type: 'array', items: evidenceSchema },
        last_verified_revision: { type: 'string' },
      },
      required: ['plan_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'resume_plan',
    description:
      '从 .mcp-probe-kit/plans/ 读取 Delegated Plan 检查点，按依赖计算下一可执行步骤、阻塞步骤和 resumeContext。只恢复计划，不执行步骤。',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        project_root: { type: 'string' },
      },
      required: ['plan_id'],
      additionalProperties: true,
    },
  },
  {
    name: 'converge',
    description:
      '在需求、规格、实现、测试、审查证据和 Plan 步骤一致后关闭计划。任一未完成步骤、未决事项或证据缺失都会拒绝收敛；通过后才允许正式写入长期记忆。',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        project_root: { type: 'string' },
        feature_name: { type: 'string', description: '可选；提供后 converge 会真实调用 check_spec' },
        docs_dir: { type: 'string', description: '规格目录，默认 docs' },
        required_evidence_kinds: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['requirements', 'spec', 'implementation', 'test', 'review', 'memory', 'other'],
          },
          description: '默认 requirements/spec/implementation/test/review',
        },
      },
      required: ['plan_id'],
      additionalProperties: true,
    },
  },
] as const;
