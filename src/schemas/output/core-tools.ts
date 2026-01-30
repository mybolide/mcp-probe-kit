/**
 * 核心开发工具的结构化输出 Schema
 * 包含: code_review, fix_bug, gentest, refactor, security_scan, perf
 */

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
          line: { type: 'number', description: '行号' },
          file: { type: 'string', description: '文件路径' },
          message: { type: 'string', description: '问题描述' },
          suggestion: { type: 'string', description: '修复建议' },
          code: { type: 'string', description: '问题代码片段' },
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
        complexity: { type: 'number' },
        maintainability: { type: 'number' },
        testCoverage: { type: 'number' },
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
    summary: { type: 'string', description: 'Bug 摘要' },
    bugType: {
      type: 'string',
      enum: ['functional', 'performance', 'security', 'ui', 'data', 'integration'],
    },
    severity: {
      type: 'string',
      enum: ['critical', 'high', 'medium', 'low'],
    },
    rootCause: { type: 'string' },
    affectedComponents: {
      type: 'array',
      items: { type: 'string' },
    },
    affectedFiles: {
      type: 'array',
      items: { type: 'string' },
    },
    fixPlan: {
      type: 'object',
      properties: {
        steps: { type: 'array', items: { type: 'string' } },
        estimatedTime: { type: 'string' },
        risks: { type: 'array', items: { type: 'string' } },
      },
      required: ['steps'],
    },
    testPlan: {
      type: 'object',
      properties: {
        unitTests: { type: 'array', items: { type: 'string' } },
        integrationTests: { type: 'array', items: { type: 'string' } },
        manualTests: { type: 'array', items: { type: 'string' } },
      },
    },
    preventionMeasures: {
      type: 'array',
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
    summary: { type: 'string' },
    framework: {
      type: 'string',
      enum: ['jest', 'vitest', 'mocha', 'jasmine', 'pytest', 'junit'],
    },
    testCases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          type: {
            type: 'string',
            enum: ['unit', 'integration', 'e2e', 'performance'],
          },
          code: { type: 'string' },
          assertions: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'type', 'code'],
      },
    },
    edgeCases: {
      type: 'array',
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
      additionalProperties: true,
    },
    coverage: {
      type: 'object',
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
    summary: { type: 'string' },
    goal: {
      type: 'string',
      enum: ['improve_readability', 'reduce_complexity', 'improve_performance', 'improve_maintainability', 'modernize'],
    },
    currentIssues: {
      type: 'array',
      items: { type: 'string' },
    },
    refactoringSteps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'number' },
          title: { type: 'string' },
          description: { type: 'string' },
          before: { type: 'string' },
          after: { type: 'string' },
          rationale: { type: 'string' },
        },
        required: ['step', 'title', 'description'],
      },
    },
    riskAssessment: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['low', 'medium', 'high'] },
        risks: { type: 'array', items: { type: 'string' } },
        mitigations: { type: 'array', items: { type: 'string' } },
      },
      required: ['level', 'risks'],
    },
    rollbackPlan: { type: 'string' },
    estimatedEffort: {
      type: 'object',
      properties: {
        hours: { type: 'number' },
        complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
    },
    expectedBenefits: {
      type: 'array',
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
    summary: { type: 'string' },
    overallRisk: {
      type: 'string',
      enum: ['critical', 'high', 'medium', 'low', 'none'],
    },
    vulnerabilities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: {
            type: 'string',
            enum: ['injection', 'xss', 'csrf', 'auth', 'crypto', 'data-exposure', 'dos', 'other'],
          },
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
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
          cwe: { type: 'string' },
          cvss: { type: 'number' },
          remediation: { type: 'string' },
          references: { type: 'array', items: { type: 'string' } },
        },
        required: ['type', 'severity', 'title', 'description'],
      },
    },
    complianceChecks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          standard: { type: 'string' },
          passed: { type: 'boolean' },
          details: { type: 'string' },
        },
      },
    },
    recommendations: {
      type: 'array',
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
    summary: { type: 'string' },
    overallScore: {
      type: 'number',
      minimum: 0,
      maximum: 100,
    },
    bottlenecks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['algorithm', 'memory', 'database', 'network', 'rendering', 'io'],
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
          impact: { type: 'string' },
          currentMetric: { type: 'string' },
        },
        required: ['type', 'severity', 'description'],
      },
    },
    metrics: {
      type: 'object',
      properties: {
        executionTime: { type: 'number' },
        memoryUsage: { type: 'number' },
        cpuUsage: { type: 'number' },
        throughput: { type: 'number' },
        latency: { type: 'number' },
      },
    },
    optimizations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          expectedImprovement: { type: 'string' },
          implementation: { type: 'string' },
        },
        required: ['title', 'description', 'priority'],
      },
    },
    benchmarks: {
      type: 'object',
      additionalProperties: true,
    },
  },
  required: ['summary', 'overallScore', 'bottlenecks', 'optimizations'],
} as const;

// TypeScript 类型定义
export interface CodeReviewReport {
  summary: string;
  overallScore: number;
  issues: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    category: 'security' | 'performance' | 'quality' | 'style' | 'best-practice';
    line?: number;
    file?: string;
    message: string;
    suggestion?: string;
    code?: string;
  }>;
  strengths?: string[];
  recommendations?: string[];
  metrics?: {
    complexity?: number;
    maintainability?: number;
    testCoverage?: number;
  };
}

export interface BugAnalysis {
  summary: string;
  bugType: 'functional' | 'performance' | 'security' | 'ui' | 'data' | 'integration';
  severity: 'critical' | 'high' | 'medium' | 'low';
  rootCause: string;
  affectedComponents?: string[];
  affectedFiles?: string[];
  fixPlan: {
    steps: string[];
    estimatedTime?: string;
    risks?: string[];
  };
  testPlan?: {
    unitTests?: string[];
    integrationTests?: string[];
    manualTests?: string[];
  };
  preventionMeasures?: string[];
}

export interface TestSuite {
  summary: string;
  framework: 'jest' | 'vitest' | 'mocha' | 'jasmine' | 'pytest' | 'junit';
  testCases: Array<{
    name: string;
    description?: string;
    type: 'unit' | 'integration' | 'e2e' | 'performance';
    code: string;
    assertions?: string[];
  }>;
  edgeCases?: Array<{
    scenario?: string;
    input?: string;
    expectedOutput?: string;
  }>;
  mockData?: Record<string, any>;
  coverage?: {
    statements?: number;
    branches?: number;
    functions?: number;
    lines?: number;
  };
}

export interface RefactorPlan {
  summary: string;
  goal: 'improve_readability' | 'reduce_complexity' | 'improve_performance' | 'improve_maintainability' | 'modernize';
  currentIssues?: string[];
  refactoringSteps: Array<{
    step: number;
    title: string;
    description: string;
    before?: string;
    after?: string;
    rationale?: string;
  }>;
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    risks: string[];
    mitigations?: string[];
  };
  rollbackPlan?: string;
  estimatedEffort?: {
    hours?: number;
    complexity?: 'low' | 'medium' | 'high';
  };
  expectedBenefits?: string[];
}

export interface SecurityReport {
  summary: string;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'none';
  vulnerabilities: Array<{
    id?: string;
    type: 'injection' | 'xss' | 'csrf' | 'auth' | 'crypto' | 'data-exposure' | 'dos' | 'other';
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    location?: {
      file?: string;
      line?: number;
      code?: string;
    };
    cwe?: string;
    cvss?: number;
    remediation?: string;
    references?: string[];
  }>;
  complianceChecks?: Array<{
    standard?: string;
    passed?: boolean;
    details?: string;
  }>;
  recommendations?: string[];
}

export interface PerformanceReport {
  summary: string;
  overallScore: number;
  bottlenecks: Array<{
    type: 'algorithm' | 'memory' | 'database' | 'network' | 'rendering' | 'io';
    severity: 'critical' | 'high' | 'medium' | 'low';
    location?: {
      file?: string;
      line?: number;
      function?: string;
    };
    description: string;
    impact?: string;
    currentMetric?: string;
  }>;
  metrics?: {
    executionTime?: number;
    memoryUsage?: number;
    cpuUsage?: number;
    throughput?: number;
    latency?: number;
  };
  optimizations: Array<{
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    expectedImprovement?: string;
    implementation?: string;
  }>;
  benchmarks?: Record<string, any>;
}
