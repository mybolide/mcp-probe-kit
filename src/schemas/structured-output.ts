/**
 * 结构化输出 Schema 定义（P0 工具）
 * 用于 MCP 2025-11-25 协议的 structuredContent
 * 
 * 注意：其他工具的 Schema 已按功能分类到 src/schemas/output/ 目录：
 * - core-tools.ts: 核心开发工具 (code_review, fix_bug, gentest, refactor, security_scan, perf)
 * - generation-tools.ts: 代码生成工具 (gendoc, genapi, gensql, genreadme, genui, gen_mock, etc.)
 * - workflow-tools.ts: 工作流编排工具 (start_review, start_release, start_refactor, start_api, start_doc)
 * - project-tools.ts: 项目管理工具 (init_project, add_feature, estimate, etc.)
 * - ui-ux-tools.ts: UI/UX 工具 (ui_design_system, ui_search, design2code, etc.)
 * - helper-tools.ts: 辅助工具 (detect_shell, init_setting, gen_skill)
 * 
 * 使用方式：
 * import { CodeReviewReportSchema } from '@/schemas/output';
 */

/**
 * Commit Message Schema
 * 用于 gencommit 工具的结构化输出
 */
export const CommitMessageSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Commit 类型：feat/fix/docs/refactor/test/chore/style/perf',
      enum: ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'style', 'perf', 'ci', 'build', 'revert'],
    },
    scope: {
      type: 'string',
      description: 'Commit 范围（可选）',
    },
    subject: {
      type: 'string',
      description: 'Commit 主题（简短描述）',
    },
    body: {
      type: 'string',
      description: 'Commit 正文（详细描述）',
    },
    footer: {
      type: 'string',
      description: 'Commit 页脚（Breaking Changes、Issue 引用等）',
    },
    fullMessage: {
      type: 'string',
      description: '完整的 commit message（可直接使用）',
    },
    emoji: {
      type: 'string',
      description: 'Emoji 前缀（如果使用 conventional+emoji 风格）',
    },
  },
  required: ['type', 'subject', 'fullMessage'],
} as const;

/**
 * Workflow Report Schema
 * 用于 start_* 编排工具的结构化输出
 */
export const WorkflowReportSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: '工作流执行摘要（一句话）',
    },
    status: {
      type: 'string',
      description: '执行状态',
      enum: ['success', 'partial', 'failed', 'pending'],
    },
    steps: {
      type: 'array',
      description: '执行步骤列表',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '步骤名称',
          },
          status: {
            type: 'string',
            description: '步骤状态',
            enum: ['completed', 'skipped', 'failed', 'pending'],
          },
          description: {
            type: 'string',
            description: '步骤描述',
          },
          output: {
            type: 'string',
            description: '步骤输出（可选）',
          },
        },
        required: ['name', 'status'],
      },
    },
    artifacts: {
      type: 'array',
      description: '生成的文件/产物',
      items: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文件路径',
          },
          type: {
            type: 'string',
            description: '文件类型',
            enum: ['code', 'doc', 'config', 'test', 'spec'],
          },
          purpose: {
            type: 'string',
            description: '文件用途',
          },
          content: {
            type: 'string',
            description: '文件内容（可选）',
          },
        },
        required: ['path', 'type', 'purpose'],
      },
    },
    nextSteps: {
      type: 'array',
      description: '后续建议步骤',
      items: {
        type: 'string',
      },
    },
    warnings: {
      type: 'array',
      description: '警告信息',
      items: {
        type: 'string',
      },
    },
    metadata: {
      type: 'object',
      description: '额外元数据（工具特定）',
      additionalProperties: true,
    },
  },
  required: ['summary', 'status', 'steps'],
} as const;

/**
 * Execution Plan Schema
 * 用于 start_* 编排工具的执行计划（metadata.plan）
 */
export const ExecutionPlanSchema = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      enum: ['delegated'],
      description: '执行模式（delegated = AI 按步骤调用工具）',
    },
    steps: {
      type: 'array',
      description: '执行步骤',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '步骤 ID' },
          tool: { type: 'string', description: '工具名称（无工具时可省略）' },
          action: { type: 'string', description: '手动操作描述（无工具时使用）' },
          args: { type: 'object', description: '工具参数' },
          outputs: {
            type: 'array',
            items: { type: 'string' },
            description: '预期产物',
          },
          when: { type: 'string', description: '执行条件（可选）' },
          dependsOn: {
            type: 'array',
            items: { type: 'string' },
            description: '依赖步骤',
          },
          note: { type: 'string', description: '补充说明' },
        },
        required: ['id'],
      },
    },
  },
  required: ['mode', 'steps'],
} as const;

/**
 * Bug Fix Report Schema
 * 用于 start_bugfix 的特定字段
 */
export const BugFixReportSchema = {
  type: 'object',
  allOf: [
    { $ref: '#/definitions/WorkflowReport' },
  ],
  properties: {
    rootCause: {
      type: 'string',
      description: '根本原因分析',
    },
    fixPlan: {
      type: 'string',
      description: '修复方案',
    },
    testPlan: {
      type: 'string',
      description: '测试计划',
    },
    commitDraft: {
      type: 'object',
      description: '提交草稿（使用 CommitMessageSchema）',
    },
    affectedFiles: {
      type: 'array',
      description: '受影响的文件',
      items: {
        type: 'string',
      },
    },
  },
  required: ['rootCause', 'fixPlan', 'testPlan'],
} as const;

/**
 * Feature Development Report Schema
 * 用于 start_feature 的特定字段
 */
export const FeatureReportSchema = {
  type: 'object',
  allOf: [
    { $ref: '#/definitions/WorkflowReport' },
  ],
  properties: {
    specArtifacts: {
      type: 'array',
      description: '规格文档产物',
      items: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '文档路径',
          },
          type: {
            type: 'string',
            description: '文档类型',
            enum: ['requirements', 'design', 'tasks', 'api-spec'],
          },
        },
        required: ['path', 'type'],
      },
    },
    estimate: {
      type: 'object',
      description: '工作量估算',
      properties: {
        storyPoints: {
          type: 'number',
          description: '故事点',
        },
        optimistic: {
          type: 'string',
          description: '乐观估计（如 "2-3天"）',
        },
        normal: {
          type: 'string',
          description: '正常估计',
        },
        pessimistic: {
          type: 'string',
          description: '悲观估计',
        },
      },
    },
    dependencies: {
      type: 'array',
      description: '依赖项',
      items: {
        type: 'string',
      },
    },
  },
  required: ['specArtifacts', 'estimate'],
} as const;

/**
 * UI Development Report Schema
 * 用于 start_ui 的特定字段
 */
export const UIReportSchema = {
  type: 'object',
  allOf: [
    { $ref: '#/definitions/WorkflowReport' },
  ],
  properties: {
    designSystem: {
      type: 'object',
      description: '设计系统配置',
      properties: {
        colors: {
          type: 'object',
          description: '色彩系统',
        },
        typography: {
          type: 'object',
          description: '字体系统',
        },
        spacing: {
          type: 'object',
          description: '间距系统',
        },
      },
    },
    catalog: {
      type: 'object',
      description: '组件目录',
      properties: {
        components: {
          type: 'array',
          description: '可用组件列表',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
              },
              category: {
                type: 'string',
              },
            },
          },
        },
      },
    },
    renderedCode: {
      type: 'object',
      description: '渲染的代码',
      properties: {
        framework: {
          type: 'string',
          description: '框架',
          enum: ['react', 'vue', 'html'],
        },
        code: {
          type: 'string',
          description: '生成的代码',
        },
      },
    },
    consistencyRules: {
      type: 'array',
      description: '一致性规则',
      items: {
        type: 'string',
      },
    },
  },
  required: ['designSystem', 'renderedCode'],
} as const;

/**
 * Onboarding Report Schema
 * 用于 start_onboard 的特定字段
 */
export const OnboardingReportSchema = {
  type: 'object',
  allOf: [
    { $ref: '#/definitions/WorkflowReport' },
  ],
  properties: {
    projectSummary: {
      type: 'object',
      description: '项目概览',
      properties: {
        name: {
          type: 'string',
        },
        description: {
          type: 'string',
        },
        techStack: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        architecture: {
          type: 'string',
        },
      },
    },
    architectureNotes: {
      type: 'string',
      description: '架构说明',
    },
    quickstart: {
      type: 'object',
      description: '快速开始指南',
      properties: {
        setup: {
          type: 'array',
          description: '设置步骤',
          items: {
            type: 'string',
          },
        },
        commonTasks: {
          type: 'array',
          description: '常见任务',
          items: {
            type: 'object',
            properties: {
              task: {
                type: 'string',
              },
              command: {
                type: 'string',
              },
            },
          },
        },
      },
    },
    keyFiles: {
      type: 'array',
      description: '关键文件',
      items: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
          },
          purpose: {
            type: 'string',
          },
        },
      },
    },
  },
  required: ['projectSummary', 'quickstart'],
} as const;

/**
 * Ralph Loop Report Schema
 * 用于 start_ralph 的特定字段
 */
export const RalphLoopReportSchema = {
  type: 'object',
  allOf: [
    { $ref: '#/definitions/WorkflowReport' },
  ],
  properties: {
    loopPolicy: {
      type: 'object',
      description: '循环策略',
      properties: {
        maxIterations: {
          type: 'number',
          description: '最大迭代次数',
        },
        maxMinutes: {
          type: 'number',
          description: '最大运行分钟数',
        },
        confirmEvery: {
          type: 'number',
          description: '每几轮确认一次',
        },
        cooldownSeconds: {
          type: 'number',
          description: '冷却秒数',
        },
      },
    },
    iterations: {
      type: 'array',
      description: '迭代历史',
      items: {
        type: 'object',
        properties: {
          iteration: {
            type: 'number',
          },
          status: {
            type: 'string',
            enum: ['success', 'failed', 'stopped'],
          },
          testsPass: {
            type: 'boolean',
          },
          changes: {
            type: 'string',
            description: 'Git diff 摘要',
          },
        },
      },
    },
    stopConditions: {
      type: 'object',
      description: '停止条件',
      properties: {
        reason: {
          type: 'string',
          description: '停止原因',
        },
        metConditions: {
          type: 'array',
          description: '满足的条件',
          items: {
            type: 'string',
          },
        },
      },
    },
    safetyChecks: {
      type: 'array',
      description: '安全检查结果',
      items: {
        type: 'object',
        properties: {
          check: {
            type: 'string',
          },
          passed: {
            type: 'boolean',
          },
          message: {
            type: 'string',
          },
        },
      },
    },
  },
  required: ['loopPolicy', 'iterations', 'stopConditions'],
} as const;

/**
 * Requirements Loop Schema
 * 用于需求澄清与补全的结构化输出
 */
export const RequirementsLoopSchema = {
  type: 'object',
  properties: {
    mode: {
      type: 'string',
      enum: ['loop'],
      description: '需求循环模式标记',
    },
    round: {
      type: 'number',
      minimum: 1,
      description: '当前轮次',
    },
    maxRounds: {
      type: 'number',
      minimum: 1,
      description: '最大轮次',
    },
    questionBudget: {
      type: 'number',
      minimum: 0,
      description: '本轮问题配额',
    },
    assumptionCap: {
      type: 'number',
      minimum: 0,
      description: '本轮假设上限',
    },
    requirements: {
      type: 'array',
      description: '需求条目列表',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '需求 ID' },
          title: { type: 'string', description: '需求标题' },
          description: { type: 'string', description: '需求描述' },
          source: {
            type: 'string',
            enum: ['User', 'Derived', 'Assumption'],
            description: '来源标记',
          },
          acceptance: {
            type: 'array',
            items: { type: 'string' },
            description: '验收标准（EARS）',
          },
        },
        required: ['id', 'title', 'description', 'source', 'acceptance'],
      },
    },
    openQuestions: {
      type: 'array',
      description: '待确认问题',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          context: { type: 'string' },
          required: { type: 'boolean' },
        },
        required: ['id', 'question'],
      },
    },
    assumptions: {
      type: 'array',
      description: '待确认假设',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          statement: { type: 'string' },
          risk: { type: 'string', enum: ['low', 'medium', 'high'] },
          needsConfirmation: { type: 'boolean' },
        },
        required: ['id', 'statement', 'risk', 'needsConfirmation'],
      },
    },
    delta: {
      type: 'object',
      description: '本轮变更摘要',
      properties: {
        added: { type: 'array', items: { type: 'string' } },
        modified: { type: 'array', items: { type: 'string' } },
        removed: { type: 'array', items: { type: 'string' } },
      },
      required: ['added', 'modified', 'removed'],
    },
    validation: {
      type: 'object',
      description: '结构化自检结果',
      properties: {
        passed: { type: 'boolean' },
        missingFields: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
      },
      required: ['passed', 'missingFields'],
    },
    stopConditions: {
      type: 'object',
      description: '结束条件状态',
      properties: {
        ready: { type: 'boolean' },
        reasons: { type: 'array', items: { type: 'string' } },
      },
      required: ['ready', 'reasons'],
    },
    metadata: {
      type: 'object',
      description: '额外元数据（如 delegated plan）',
      additionalProperties: true,
    },
  },
  required: [
    'mode',
    'round',
    'maxRounds',
    'requirements',
    'openQuestions',
    'assumptions',
    'delta',
    'validation',
    'stopConditions',
  ],
} as const;

/**
 * TypeScript 类型定义
 */
export interface CommitMessage {
  type: 'feat' | 'fix' | 'docs' | 'refactor' | 'test' | 'chore' | 'style' | 'perf' | 'ci' | 'build' | 'revert';
  scope?: string;
  subject: string;
  body?: string;
  footer?: string;
  fullMessage: string;
  emoji?: string;
}

export interface WorkflowStep {
  name: string;
  status: 'completed' | 'skipped' | 'failed' | 'pending';
  description?: string;
  output?: string;
}

export interface Artifact {
  path: string;
  type: 'code' | 'doc' | 'config' | 'test' | 'spec';
  purpose: string;
  content?: string;
}

export interface WorkflowReport {
  summary: string;
  status: 'success' | 'partial' | 'failed' | 'pending';
  steps: WorkflowStep[];
  artifacts?: Artifact[];
  nextSteps?: string[];
  warnings?: string[];
  metadata?: Record<string, any>;
}

export interface PlanStep {
  id: string;
  tool?: string;
  action?: string;
  args?: Record<string, any>;
  outputs?: string[];
  when?: string;
  dependsOn?: string[];
  note?: string;
}

export interface ExecutionPlan {
  mode: 'delegated';
  steps: PlanStep[];
}

export interface BugFixReport extends WorkflowReport {
  rootCause: string;
  fixPlan: string;
  testPlan: string;
  commitDraft?: CommitMessage;
  affectedFiles?: string[];
}

export interface FeatureReport extends WorkflowReport {
  specArtifacts: Array<{
    path: string;
    type: 'requirements' | 'design' | 'tasks' | 'api-spec';
  }>;
  estimate: {
    storyPoints?: number;
    optimistic?: string;
    normal?: string;
    pessimistic?: string;
  };
  dependencies?: string[];
}

export interface UIReport extends WorkflowReport {
  designSystem: {
    colors?: any;
    typography?: any;
    spacing?: any;
  };
  catalog?: {
    components?: Array<{
      name: string;
      category: string;
    }>;
  };
  renderedCode: {
    framework: 'react' | 'vue' | 'html';
    code: string;
  };
  consistencyRules?: string[];
}

export interface OnboardingReport extends WorkflowReport {
  projectSummary: {
    name?: string;
    description?: string;
    techStack?: string[];
    architecture?: string;
  };
  architectureNotes?: string;
  quickstart: {
    setup?: string[];
    commonTasks?: Array<{
      task: string;
      command: string;
    }>;
  };
  keyFiles?: Array<{
    path: string;
    purpose: string;
  }>;
}

export interface RalphLoopReport extends WorkflowReport {
  loopPolicy: {
    maxIterations?: number;
    maxMinutes?: number;
    confirmEvery?: number;
    cooldownSeconds?: number;
  };
  iterations: Array<{
    iteration: number;
    status: 'success' | 'failed' | 'stopped';
    testsPass?: boolean;
    changes?: string;
  }>;
  stopConditions: {
    reason: string;
    metConditions?: string[];
  };
  safetyChecks?: Array<{
    check: string;
    passed: boolean;
    message?: string;
  }>;
}

export interface RequirementItem {
  id: string;
  title: string;
  description: string;
  source: 'User' | 'Derived' | 'Assumption';
  acceptance: string[];
}

export interface OpenQuestion {
  id: string;
  question: string;
  context?: string;
  required?: boolean;
}

export interface RequirementAssumption {
  id: string;
  statement: string;
  risk: 'low' | 'medium' | 'high';
  needsConfirmation: boolean;
}

export interface RequirementsDelta {
  added: string[];
  modified: string[];
  removed: string[];
}

export interface RequirementsValidation {
  passed: boolean;
  missingFields: string[];
  warnings?: string[];
}

export interface RequirementsStopConditions {
  ready: boolean;
  reasons: string[];
}

export interface RequirementsLoopReport {
  mode: 'loop';
  round: number;
  maxRounds: number;
  questionBudget?: number;
  assumptionCap?: number;
  requirements: RequirementItem[];
  openQuestions: OpenQuestion[];
  assumptions: RequirementAssumption[];
  delta: RequirementsDelta;
  validation: RequirementsValidation;
  stopConditions: RequirementsStopConditions;
  metadata?: Record<string, any>;
}

// ============================================================================
// 第 2 组: P1 高价值工具 Schema（7 个）
// ============================================================================

/**
 * Code Review Report Schema
 * 用于 code_review 工具的结构化输出
 */
export const CodeReviewReportSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: '审查总结',
    },
    overallScore: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: '总体评分（0-100）',
    },
    issues: {
      type: 'array',
      description: '问题列表',
      items: {
        type: 'object',
        properties: {
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low', 'info'],
            description: '严重程度',
          },
          category: {
            type: 'string',
            enum: ['security', 'performance', 'quality', 'style', 'best-practice'],
            description: '问题类别',
          },
          line: {
            type: 'number',
            description: '行号',
          },
          file: {
            type: 'string',
            description: '文件路径',
          },
          message: {
            type: 'string',
            description: '问题描述',
          },
          suggestion: {
            type: 'string',
            description: '修复建议',
          },
          code: {
            type: 'string',
            description: '问题代码片段',
          },
        },
        required: ['severity', 'category', 'message'],
      },
    },
    strengths: {
      type: 'array',
      items: { type: 'string' },
      description: '代码优点',
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
      description: '改进建议',
    },
    metrics: {
      type: 'object',
      description: '代码指标',
      properties: {
        complexity: { type: 'number', description: '复杂度' },
        maintainability: { type: 'number', description: '可维护性' },
        testCoverage: { type: 'number', description: '测试覆盖率' },
      },
    },
  },
  required: ['summary', 'overallScore', 'issues'],
} as const;

/**
 * Bug Analysis Schema
 * 用于 fix_bug 工具的结构化输出
 */
export const BugAnalysisSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Bug 摘要',
    },
    bugType: {
      type: 'string',
      enum: ['functional', 'performance', 'security', 'ui', 'data', 'integration'],
      description: 'Bug 类型',
    },
    severity: {
      type: 'string',
      enum: ['critical', 'high', 'medium', 'low'],
      description: '严重程度',
    },
    rootCause: {
      type: 'string',
      description: '根本原因',
    },
    affectedComponents: {
      type: 'array',
      description: '受影响的组件',
      items: { type: 'string' },
    },
    affectedFiles: {
      type: 'array',
      description: '受影响的文件',
      items: { type: 'string' },
    },
    fixPlan: {
      type: 'object',
      description: '修复计划',
      properties: {
        steps: {
          type: 'array',
          items: { type: 'string' },
        },
        estimatedTime: { type: 'string' },
        risks: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['steps'],
    },
    testPlan: {
      type: 'object',
      description: '测试计划',
      properties: {
        unitTests: {
          type: 'array',
          items: { type: 'string' },
        },
        integrationTests: {
          type: 'array',
          items: { type: 'string' },
        },
        manualTests: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
    preventionMeasures: {
      type: 'array',
      description: '预防措施',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'bugType', 'severity', 'rootCause', 'fixPlan', 'testPlan'],
} as const;

/**
 * Test Suite Schema
 * 用于 gentest 工具的结构化输出
 */
export const TestSuiteSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: '测试套件摘要',
    },
    framework: {
      type: 'string',
      enum: ['jest', 'vitest', 'mocha', 'jasmine', 'pytest', 'junit'],
      description: '测试框架',
    },
    testCases: {
      type: 'array',
      description: '测试用例列表',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '测试名称' },
          description: { type: 'string', description: '测试描述' },
          type: {
            type: 'string',
            enum: ['unit', 'integration', 'e2e', 'performance'],
            description: '测试类型',
          },
          code: { type: 'string', description: '测试代码' },
          assertions: {
            type: 'array',
            items: { type: 'string' },
            description: '断言列表',
          },
        },
        required: ['name', 'type', 'code'],
      },
    },
    edgeCases: {
      type: 'array',
      description: '边界条件测试',
      items: {
        type: 'object',
        properties: {
          scenario: { type: 'string' },
          input: { type: 'string' },
          expectedOutput: { type: 'string' },
        },
      },
    },
    mockData: {
      type: 'object',
      description: 'Mock 数据定义',
      additionalProperties: true,
    },
    coverage: {
      type: 'object',
      description: '覆盖率目标',
      properties: {
        statements: { type: 'number' },
        branches: { type: 'number' },
        functions: { type: 'number' },
        lines: { type: 'number' },
      },
    },
  },
  required: ['summary', 'framework', 'testCases'],
} as const;

/**
 * Refactor Plan Schema
 * 用于 refactor 工具的结构化输出
 */
export const RefactorPlanSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: '重构摘要',
    },
    goal: {
      type: 'string',
      enum: ['improve_readability', 'reduce_complexity', 'improve_performance', 'improve_maintainability', 'modernize'],
      description: '重构目标',
    },
    currentIssues: {
      type: 'array',
      description: '当前问题',
      items: { type: 'string' },
    },
    refactoringSteps: {
      type: 'array',
      description: '重构步骤',
      items: {
        type: 'object',
        properties: {
          step: { type: 'number' },
          title: { type: 'string' },
          description: { type: 'string' },
          before: { type: 'string', description: '重构前代码' },
          after: { type: 'string', description: '重构后代码' },
          rationale: { type: 'string', description: '重构理由' },
        },
        required: ['step', 'title', 'description'],
      },
    },
    riskAssessment: {
      type: 'object',
      description: '风险评估',
      properties: {
        level: { type: 'string', enum: ['low', 'medium', 'high'] },
        risks: {
          type: 'array',
          items: { type: 'string' },
        },
        mitigations: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['level', 'risks'],
    },
    rollbackPlan: {
      type: 'string',
      description: '回滚计划',
    },
    estimatedEffort: {
      type: 'object',
      description: '预估工作量',
      properties: {
        hours: { type: 'number' },
        complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
    },
    expectedBenefits: {
      type: 'array',
      description: '预期收益',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'goal', 'refactoringSteps', 'riskAssessment'],
} as const;

/**
 * Security Report Schema
 * 用于 security_scan 工具的结构化输出
 */
export const SecurityReportSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: '安全扫描摘要',
    },
    overallRisk: {
      type: 'string',
      enum: ['critical', 'high', 'medium', 'low', 'none'],
      description: '总体风险等级',
    },
    vulnerabilities: {
      type: 'array',
      description: '漏洞列表',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '漏洞ID' },
          type: {
            type: 'string',
            enum: ['injection', 'xss', 'csrf', 'auth', 'crypto', 'data-exposure', 'dos', 'other'],
            description: '漏洞类型',
          },
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
            description: '严重程度',
          },
          title: { type: 'string' },
          description: { type: 'string' },
          location: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              line: { type: 'number' },
              code: { type: 'string' },
            },
          },
          cwe: { type: 'string', description: 'CWE编号' },
          cvss: { type: 'number', description: 'CVSS评分' },
          remediation: { type: 'string', description: '修复建议' },
          references: {
            type: 'array',
            items: { type: 'string' },
            description: '参考链接',
          },
        },
        required: ['type', 'severity', 'title', 'description'],
      },
    },
    complianceChecks: {
      type: 'array',
      description: '合规性检查',
      items: {
        type: 'object',
        properties: {
          standard: { type: 'string', description: '标准名称（如OWASP Top 10）' },
          passed: { type: 'boolean' },
          details: { type: 'string' },
        },
      },
    },
    recommendations: {
      type: 'array',
      description: '安全建议',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'overallRisk', 'vulnerabilities'],
} as const;

/**
 * Performance Report Schema
 * 用于 perf 工具的结构化输出
 */
export const PerformanceReportSchema = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: '性能分析摘要',
    },
    overallScore: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: '总体性能评分',
    },
    bottlenecks: {
      type: 'array',
      description: '性能瓶颈',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['algorithm', 'memory', 'database', 'network', 'rendering', 'io'],
            description: '瓶颈类型',
          },
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
          },
          location: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              line: { type: 'number' },
              function: { type: 'string' },
            },
          },
          description: { type: 'string' },
          impact: { type: 'string', description: '性能影响' },
          currentMetric: { type: 'string', description: '当前指标' },
        },
        required: ['type', 'severity', 'description'],
      },
    },
    metrics: {
      type: 'object',
      description: '性能指标',
      properties: {
        executionTime: { type: 'number', description: '执行时间（ms）' },
        memoryUsage: { type: 'number', description: '内存使用（MB）' },
        cpuUsage: { type: 'number', description: 'CPU使用率（%）' },
        throughput: { type: 'number', description: '吞吐量' },
        latency: { type: 'number', description: '延迟（ms）' },
      },
    },
    optimizations: {
      type: 'array',
      description: '优化建议',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          expectedImprovement: { type: 'string', description: '预期提升' },
          implementation: { type: 'string', description: '实现方法' },
        },
        required: ['title', 'description', 'priority'],
      },
    },
    benchmarks: {
      type: 'object',
      description: '基准测试结果',
      additionalProperties: true,
    },
  },
  required: ['summary', 'overallScore', 'bottlenecks', 'optimizations'],
} as const;
