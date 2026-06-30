/**
 * 项目管理工具的结构化输出 Schema
 * 包含: init_project, init_project_context, add_feature, estimate, split, resolve_conflict
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
    projectRoot: { type: 'string', description: '解析后的项目根目录（POSIX）' },
    bootstrap: {
      type: 'object',
      description: 'MCP Skill / AGENTS.md 自动安装结果',
      properties: {
        skillPath: { type: 'string' },
        agentsMdPath: { type: 'string' },
        skillCreated: { type: 'boolean' },
        skillUpdated: { type: 'boolean' },
        agentsCreated: { type: 'boolean' },
        agentsUpdated: { type: 'boolean' },
        workspaceWarnings: { type: 'array', items: { type: 'string' } },
        rootSource: { type: 'string' },
        explicitHonored: { type: 'boolean' },
      },
    },
    structure: {
      type: 'object',
      description: '项目结构',
      properties: {
        directories: { type: 'array', items: { type: 'string' } },
        files: { type: 'array', items: { type: 'string' }, description: '已废弃，请用 writtenFiles / plannedFiles' },
        writtenFiles: { type: 'array', items: { type: 'string' }, description: '已写入磁盘的路径' },
        plannedFiles: { type: 'array', items: { type: 'string' }, description: '规划中尚未创建的路径' },
      },
    },
    writtenFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          action: { type: 'string', enum: ['created', 'updated', 'skipped'] },
        },
      },
    },
    pendingFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          reason: { type: 'string' },
        },
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
    mode: { 
      type: 'string',
      enum: ['single', 'modular'],
      description: '生成模式：single（单文件）或 modular（模块化）'
    },
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
          exists: { type: 'boolean', description: '文件是否已存在于磁盘' },
          written: { type: 'boolean', description: '内容是否已落盘（MCP 已写或 Agent 无需再写）' },
          agent_action_required: {
            type: 'boolean',
            description: '是否仍需 Agent 按 plan 手动写入',
          },
        },
      },
      description: '文档索引（含 exists / written / agent_action_required 状态）',
    },
    writtenFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          action: { type: 'string', enum: ['created', 'updated', 'skipped'] },
        },
      },
    },
    pendingFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    nextSteps: {
      type: 'array',
      items: { type: 'string' },
    },
    metadata: {
      type: 'object',
      description: '额外元数据（如 delegated plan、图谱文档路径）',
      additionalProperties: true,
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
    writtenFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          action: { type: 'string', enum: ['created', 'updated', 'skipped'] },
        },
      },
    },
    pendingFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    specPaths: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'featureName', 'requirements', 'tasks'],
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
  projectRoot?: string;
  bootstrap?: {
    skillPath: string;
    agentsMdPath: string;
    skillCreated: boolean;
    skillUpdated: boolean;
    agentsCreated: boolean;
    agentsUpdated: boolean;
    workspaceWarnings: string[];
    rootSource: string;
    explicitHonored: boolean;
  };
  structure: {
    directories?: string[];
    files?: string[];
    writtenFiles?: string[];
    plannedFiles?: string[];
  };
  writtenFiles?: Array<{ path: string; action: 'created' | 'updated' | 'skipped' }>;
  pendingFiles?: Array<{ path: string; reason: string }>;
  techStack?: string[];
  dependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  nextSteps?: string[];
}

export interface ProjectContext {
  summary: string;
  mode?: 'single' | 'modular';
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
    exists?: boolean;
    written?: boolean;
    agent_action_required?: boolean;
  }>;
  nextSteps?: string[];
  metadata?: Record<string, any>;
  writtenFiles?: Array<{ path: string; action: 'created' | 'updated' | 'skipped' }>;
  pendingFiles?: Array<{ path: string; reason: string }>;
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
  writtenFiles?: Array<{ path: string; action: 'created' | 'updated' | 'skipped' }>;
  pendingFiles?: Array<{ path: string; reason: string }>;
  specPaths?: string[];
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
