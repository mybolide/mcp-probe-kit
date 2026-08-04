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

const artifactSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    kind: { type: 'string' },
    summary: { type: 'string' },
    reference: { type: 'string' },
    step_id: { type: 'string' },
    revision: { type: 'string' },
    metadata: { type: 'object', additionalProperties: true },
    recorded_at: { type: 'string' },
  },
  additionalProperties: true,
} as const;

const candidateSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    summary: { type: 'string' },
    status: { type: 'string', enum: ['candidate', 'validated', 'rejected'] },
    evidence: { type: 'array', items: { type: 'string' } },
    payload: {},
    recorded_at: { type: 'string' },
  },
  additionalProperties: true,
} as const;

const acceptanceResultSchema = {
  type: 'object',
  properties: {
    gate_id: { type: 'string' },
    passed: { type: 'boolean' },
    summary: { type: 'string' },
    reference: { type: 'string' },
    verified_at: { type: 'string' },
  },
  required: ['gate_id', 'passed', 'summary'],
  additionalProperties: true,
} as const;

const runtimeEvidenceSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string' },
    summary: { type: 'string' },
    reference: { type: 'string' },
    revision: { type: 'string' },
    verified_at: { type: 'string' },
  },
  required: ['summary'],
  additionalProperties: true,
} as const;

export const planToolSchemas = [
  {
    name: 'plan_heartbeat',
    description:
      '由 Agent 在 Delegated Plan 执行过程中记录轻量检查点。首次调用必须提供完整 plan；后续合并步骤、证据、产物、候选经验、验收结果、运行证据和 revision。只记录状态，不代替 Agent 执行。',
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
        declared_scope: {
          type: 'object',
          description: '本次 Plan 已确认的目录、模块、契约、排除项等作用域；省略时保留原值',
          additionalProperties: true,
        },
        artifacts: { type: 'array', items: artifactSchema },
        memory_candidates: { type: 'array', items: candidateSchema },
        architecture_candidates: { type: 'array', items: candidateSchema },
        acceptance_results: { type: 'array', items: acceptanceResultSchema },
        runtime_evidence: { type: 'array', items: runtimeEvidenceSchema },
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
      '按 Delegated Plan 自己声明的证据和质量闸门关闭计划。任一未完成步骤、未决事项、必需证据或验收结果缺失都会拒绝收敛；调用参数只能增加证据要求，不能削弱 Plan。',
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
          description: '可选附加要求；与 Plan.requiredEvidenceKinds 合并，不能移除 Plan 已声明要求',
        },
      },
      required: ['plan_id'],
      additionalProperties: true,
    },
  },
] as const;
