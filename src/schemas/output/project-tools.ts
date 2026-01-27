/**
 * 项目管理工具的结构化输出 Schema
 * 包含: init_project, init_project_context, add_feature, analyze_project, estimate, check_deps, split, resolve_conflict
 */

/**
 * Project Init Schema
 * 用于 init_project 工具的结构化输出
 */
export const ProjectInitSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    projectName: { type: 'string' },
    structure: {
      type: 'object',
      description: '项目结构',
      properties: {
        directories: { type: 'array', items: { type: 'string' } },
        files: { type: 'array', items: { type: 'string' } },
      },
    },
    techStack: {
      type: 'array',
      items: { type: 'string' },
    },
    dependencies: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    scripts: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    nextSteps: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'projectName', 'structure'],
} as const;

/**
 * Project Context Schema
 * 用于 init_project_context 工具的结构化输出
 */
export const ProjectContextSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    projectOverview: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        techStack: { type: 'array', items: { type: 'string' } },
        architecture: { type: 'string' },
      },
    },
    codingStandards: {
      type: 'array',
      items: { type: 'string' },
    },
    workflows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          steps: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    documentation: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          purpose: { type: 'string' },
        },
      },
    },
  },
  required: ['summary', 'projectOverview'],
} as const;

/**
 * Feature Spec Schema
 * 用于 add_feature 工具的结构化输出
 */
export const FeatureSpecSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    featureName: { type: 'string' },
    requirements: {
      type: 'array',
      items: { type: 'string' },
    },
    design: {
      type: 'object',
      properties: {
        architecture: { type: 'string' },
        components: { type: 'array', items: { type: 'string' } },
        dataFlow: { type: 'string' },
      },
    },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          estimatedHours: { type: 'number' },
          dependencies: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    estimate: {
      type: 'object',
      properties: {
        storyPoints: { type: 'number' },
        optimistic: { type: 'string' },
        normal: { type: 'string' },
        pessimistic: { type: 'string' },
      },
    },
  },
  required: ['summary', 'featureName', 'requirements', 'tasks'],
} as const;

/**
 * Project Analysis Schema
 * 用于 analyze_project 工具的结构化输出
 */
export const ProjectAnalysisSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    structure: {
      type: 'object',
      properties: {
        totalFiles: { type: 'number' },
        totalLines: { type: 'number' },
        languages: { type: 'object', additionalProperties: { type: 'number' } },
      },
    },
    techStack: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          purpose: { type: 'string' },
        },
      },
    },
    architecture: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        layers: { type: 'array', items: { type: 'string' } },
        description: { type: 'string' },
      },
    },
    dependencies: {
      type: 'object',
      properties: {
        production: { type: 'number' },
        development: { type: 'number' },
        outdated: { type: 'number' },
      },
    },
    codeQuality: {
      type: 'object',
      properties: {
        complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
        maintainability: { type: 'number' },
        testCoverage: { type: 'number' },
      },
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'structure', 'techStack'],
} as const;

/**
 * Estimate Schema
 * 用于 estimate 工具的结构化输出
 */
export const EstimateSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    storyPoints: { type: 'number' },
    timeEstimates: {
      type: 'object',
      properties: {
        optimistic: { type: 'string' },
        normal: { type: 'string' },
        pessimistic: { type: 'string' },
      },
      required: ['optimistic', 'normal', 'pessimistic'],
    },
    breakdown: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          hours: { type: 'number' },
          complexity: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          risk: { type: 'string' },
          impact: { type: 'string', enum: ['low', 'medium', 'high'] },
          mitigation: { type: 'string' },
        },
      },
    },
    assumptions: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'storyPoints', 'timeEstimates'],
} as const;

/**
 * Dependency Report Schema
 * 用于 check_deps 工具的结构化输出
 */
export const DependencyReportSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    totalDependencies: { type: 'number' },
    outdated: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          current: { type: 'string' },
          latest: { type: 'string' },
          type: { type: 'string', enum: ['major', 'minor', 'patch'] },
        },
      },
    },
    vulnerabilities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          description: { type: 'string' },
          fixAvailable: { type: 'boolean' },
        },
      },
    },
    unused: {
      type: 'array',
      items: { type: 'string' },
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'totalDependencies'],
} as const;

/**
 * Split Plan Schema
 * 用于 split 工具的结构化输出
 */
export const SplitPlanSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    strategy: {
      type: 'string',
      enum: ['by-type', 'by-function', 'by-component', 'auto'],
    },
    modules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          path: { type: 'string' },
          purpose: { type: 'string' },
          exports: { type: 'array', items: { type: 'string' } },
          dependencies: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    benefits: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'strategy', 'modules'],
} as const;

/**
 * Conflict Resolution Schema
 * 用于 resolve_conflict 工具的结构化输出
 */
export const ConflictResolutionSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    conflicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          ours: { type: 'string' },
          theirs: { type: 'string' },
          resolution: { type: 'string' },
          rationale: { type: 'string' },
        },
      },
    },
    resolvedCode: { type: 'string' },
    explanation: { type: 'string' },
  },
  required: ['summary', 'conflicts', 'resolvedCode'],
} as const;

// TypeScript 类型定义
export interface ProjectInit {
  summary: string;
  projectName: string;
  structure: {
    directories?: string[];
    files?: string[];
  };
  techStack?: string[];
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  nextSteps?: string[];
}

export interface ProjectContext {
  summary: string;
  projectOverview: {
    name?: string;
    description?: string;
    techStack?: string[];
    architecture?: string;
  };
  codingStandards?: string[];
  workflows?: Array<{
    name?: string;
    description?: string;
    steps?: string[];
  }>;
  documentation?: Array<{
    path?: string;
    purpose?: string;
  }>;
}

export interface FeatureSpec {
  summary: string;
  featureName: string;
  requirements: string[];
  design?: {
    architecture?: string;
    components?: string[];
    dataFlow?: string;
  };
  tasks: Array<{
    id?: string;
    title?: string;
    description?: string;
    estimatedHours?: number;
    dependencies?: string[];
  }>;
  estimate?: {
    storyPoints?: number;
    optimistic?: string;
    normal?: string;
    pessimistic?: string;
  };
}

export interface ProjectAnalysis {
  summary: string;
  structure: {
    totalFiles?: number;
    totalLines?: number;
    languages?: Record<string, number>;
  };
  techStack: Array<{
    name?: string;
    version?: string;
    purpose?: string;
  }>;
  architecture?: {
    pattern?: string;
    layers?: string[];
    description?: string;
  };
  dependencies?: {
    production?: number;
    development?: number;
    outdated?: number;
  };
  codeQuality?: {
    complexity?: 'low' | 'medium' | 'high';
    maintainability?: number;
    testCoverage?: number;
  };
  recommendations?: string[];
}

export interface Estimate {
  summary: string;
  storyPoints: number;
  timeEstimates: {
    optimistic: string;
    normal: string;
    pessimistic: string;
  };
  breakdown?: Array<{
    task?: string;
    hours?: number;
    complexity?: 'low' | 'medium' | 'high';
  }>;
  risks?: Array<{
    risk?: string;
    impact?: 'low' | 'medium' | 'high';
    mitigation?: string;
  }>;
  assumptions?: string[];
}

export interface DependencyReport {
  summary: string;
  totalDependencies: number;
  outdated?: Array<{
    name?: string;
    current?: string;
    latest?: string;
    type?: 'major' | 'minor' | 'patch';
  }>;
  vulnerabilities?: Array<{
    name?: string;
    severity?: 'critical' | 'high' | 'medium' | 'low';
    description?: string;
    fixAvailable?: boolean;
  }>;
  unused?: string[];
  recommendations?: string[];
}

export interface SplitPlan {
  summary: string;
  strategy: 'by-type' | 'by-function' | 'by-component' | 'auto';
  modules: Array<{
    name?: string;
    path?: string;
    purpose?: string;
    exports?: string[];
    dependencies?: string[];
  }>;
  benefits?: string[];
}

export interface ConflictResolution {
  summary: string;
  conflicts: Array<{
    file?: string;
    line?: number;
    ours?: string;
    theirs?: string;
    resolution?: string;
    rationale?: string;
  }>;
  resolvedCode: string;
  explanation?: string;
}
