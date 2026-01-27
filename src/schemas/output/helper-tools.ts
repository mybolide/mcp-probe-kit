/**
 * 辅助工具的结构化输出 Schema
 * 包含: detect_shell, init_setting, gen_skill
 */

/**
 * Shell Detection Schema
 * 用于 detect_shell 工具的结构化输出
 */
export const ShellDetectionSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    shell: {
      type: 'string',
      enum: ['bash', 'zsh', 'fish', 'powershell', 'cmd', 'sh', 'unknown'],
      description: '检测到的 Shell 类型',
    },
    version: { type: 'string', description: 'Shell 版本' },
    os: {
      type: 'string',
      enum: ['linux', 'macos', 'windows', 'unknown'],
      description: '操作系统',
    },
    features: {
      type: 'array',
      items: { type: 'string' },
      description: 'Shell 特性',
    },
    configFiles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          exists: { type: 'boolean' },
          purpose: { type: 'string' },
        },
      },
    },
    recommendations: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'shell', 'os'],
} as const;

/**
 * Setting Init Schema
 * 用于 init_setting 工具的结构化输出
 */
export const SettingInitSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    settingsPath: { type: 'string', description: '设置文件路径' },
    settings: {
      type: 'object',
      description: '推荐的设置',
      additionalProperties: true,
    },
    applied: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          value: { type: 'string' },
          reason: { type: 'string' },
        },
      },
    },
    nextSteps: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'settingsPath', 'settings'],
} as const;

/**
 * Skill Doc Schema
 * 用于 gen_skill 工具的结构化输出
 */
export const SkillDocSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    scope: {
      type: 'string',
      enum: ['all', 'single'],
      description: '生成范围',
    },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          toolName: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          useCases: {
            type: 'array',
            items: { type: 'string' },
          },
          examples: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                scenario: { type: 'string' },
                input: { type: 'string' },
                output: { type: 'string' },
              },
            },
          },
          parameters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                required: { type: 'boolean' },
                description: { type: 'string' },
              },
            },
          },
        },
      },
    },
    outputPath: { type: 'string', description: '输出路径' },
    format: {
      type: 'string',
      enum: ['markdown', 'json'],
    },
  },
  required: ['summary', 'scope', 'skills'],
} as const;

// TypeScript 类型定义
export interface ShellDetection {
  summary: string;
  shell: 'bash' | 'zsh' | 'fish' | 'powershell' | 'cmd' | 'sh' | 'unknown';
  version?: string;
  os: 'linux' | 'macos' | 'windows' | 'unknown';
  features?: string[];
  configFiles?: Array<{
    path?: string;
    exists?: boolean;
    purpose?: string;
  }>;
  recommendations?: string[];
}

export interface SettingInit {
  summary: string;
  settingsPath: string;
  settings: Record<string, any>;
  applied?: Array<{
    key?: string;
    value?: string;
    reason?: string;
  }>;
  nextSteps?: string[];
}

export interface SkillDoc {
  summary: string;
  scope: 'all' | 'single';
  skills: Array<{
    toolName?: string;
    title?: string;
    description?: string;
    category?: string;
    useCases?: string[];
    examples?: Array<{
      scenario?: string;
      input?: string;
      output?: string;
    }>;
    parameters?: Array<{
      name?: string;
      type?: string;
      required?: boolean;
      description?: string;
    }>;
  }>;
  outputPath?: string;
  format?: 'markdown' | 'json';
}
