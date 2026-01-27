/**
 * 工作流编排工具的结构化输出 Schema
 * 包含: start_review, start_release, start_refactor, start_api, start_doc
 * 
 * 注意：这些工具都基于 WorkflowReportSchema（在 structured-output.ts 中定义）
 */

import { WorkflowReport } from '../structured-output.js';

/**
 * Review Workflow Schema
 * 用于 start_review 工具的结构化输出
 */
export const ReviewWorkflowSchema = {
  type: 'object',
  allOf: [
    { $ref: '#/definitions/WorkflowReport' },
  ],
  properties: {
    reviewResults: {
      type: 'object',
      description: '审查结果',
      properties: {
        codeReview: { type: 'object', description: '代码审查结果' },
        securityScan: { type: 'object', description: '安全扫描结果' },
        perfAnalysis: { type: 'object', description: '性能分析结果' },
      },
    },
    overallScore: {
      type: 'number',
      minimum: 0,
      maximum: 100,
      description: '总体评分',
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
      description: '改进建议',
    },
  },
  required: ['reviewResults', 'overallScore'],
} as const;

/**
 * Release Workflow Schema
 * 用于 start_release 工具的结构化输出
 */
export const ReleaseWorkflowSchema = {
  type: 'object',
  allOf: [
    { $ref: '#/definitions/WorkflowReport' },
  ],
  properties: {
    version: {
      type: 'string',
      description: '发布版本号',
    },
    changelog: {
      type: 'object',
      description: 'Changelog 内容',
    },
    pullRequest: {
      type: 'object',
      description: 'PR 描述',
    },
    releaseNotes: {
      type: 'string',
      description: '发布说明',
    },
    checklist: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          completed: { type: 'boolean' },
        },
      },
    },
  },
  required: ['version', 'changelog'],
} as const;

/**
 * Refactor Workflow Schema
 * 用于 start_refactor 工具的结构化输出
 */
export const RefactorWorkflowSchema = {
  type: 'object',
  allOf: [
    { $ref: '#/definitions/WorkflowReport' },
  ],
  properties: {
    refactorPlan: {
      type: 'object',
      description: '重构计划',
    },
    codeReview: {
      type: 'object',
      description: '代码审查结果',
    },
    testSuite: {
      type: 'object',
      description: '测试套件',
    },
    riskAssessment: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['low', 'medium', 'high'] },
        risks: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  required: ['refactorPlan', 'riskAssessment'],
} as const;

/**
 * API Workflow Schema
 * 用于 start_api 工具的结构化输出
 */
export const APIWorkflowSchema = {
  type: 'object',
  allOf: [
    { $ref: '#/definitions/WorkflowReport' },
  ],
  properties: {
    apiDocumentation: {
      type: 'object',
      description: 'API 文档',
    },
    mockData: {
      type: 'object',
      description: 'Mock 数据',
    },
    testSuite: {
      type: 'object',
      description: '测试套件',
    },
    endpoints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          method: { type: 'string' },
          path: { type: 'string' },
          status: { type: 'string', enum: ['implemented', 'documented', 'tested'] },
        },
      },
    },
  },
  required: ['apiDocumentation', 'endpoints'],
} as const;

/**
 * Documentation Workflow Schema
 * 用于 start_doc 工具的结构化输出
 */
export const DocWorkflowSchema = {
  type: 'object',
  allOf: [
    { $ref: '#/definitions/WorkflowReport' },
  ],
  properties: {
    codeDocumentation: {
      type: 'object',
      description: '代码文档',
    },
    apiDocumentation: {
      type: 'object',
      description: 'API 文档',
    },
    readme: {
      type: 'object',
      description: 'README 文档',
    },
    coverage: {
      type: 'object',
      properties: {
        functions: { type: 'number', description: '函数文档覆盖率' },
        classes: { type: 'number', description: '类文档覆盖率' },
        modules: { type: 'number', description: '模块文档覆盖率' },
      },
    },
  },
  required: ['coverage'],
} as const;

// TypeScript 类型定义
export interface ReviewWorkflowReport extends WorkflowReport {
  reviewResults: {
    codeReview?: any;
    securityScan?: any;
    perfAnalysis?: any;
  };
  overallScore: number;
  recommendations?: string[];
}

export interface ReleaseWorkflowReport extends WorkflowReport {
  version: string;
  changelog: any;
  pullRequest?: any;
  releaseNotes?: string;
  checklist?: Array<{
    item?: string;
    completed?: boolean;
  }>;
}

export interface RefactorWorkflowReport extends WorkflowReport {
  refactorPlan: any;
  codeReview?: any;
  testSuite?: any;
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    risks?: string[];
  };
}

export interface APIWorkflowReport extends WorkflowReport {
  apiDocumentation: any;
  mockData?: any;
  testSuite?: any;
  endpoints: Array<{
    method?: string;
    path?: string;
    status?: 'implemented' | 'documented' | 'tested';
  }>;
}

export interface DocWorkflowReport extends WorkflowReport {
  codeDocumentation?: any;
  apiDocumentation?: any;
  readme?: any;
  coverage: {
    functions?: number;
    classes?: number;
    modules?: number;
  };
}
