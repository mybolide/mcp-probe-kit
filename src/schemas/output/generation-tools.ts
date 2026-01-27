/**
 * 代码生成工具的结构化输出 Schema
 * 包含: gendoc, genapi, gensql, genreadme, genui, gen_mock, genchangelog, genpr, fix, explain, convert, css_order
 */

/**
 * Documentation Schema
 * 用于 gendoc 工具的结构化输出
 */
export const DocumentationSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '文档摘要' },
    docType: {
      type: 'string',
      enum: ['jsdoc', 'tsdoc', 'javadoc', 'pydoc', 'godoc'],
      description: '文档类型',
    },
    documentation: {
      type: 'string',
      description: '生成的文档内容',
    },
    functions: {
      type: 'array',
      description: '函数文档列表',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          parameters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                description: { type: 'string' },
                optional: { type: 'boolean' },
              },
            },
          },
          returns: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              description: { type: 'string' },
            },
          },
          throws: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          examples: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
  required: ['summary', 'docType', 'documentation'],
} as const;

/**
 * API Documentation Schema
 * 用于 genapi 工具的结构化输出
 */
export const APIDocumentationSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    format: {
      type: 'string',
      enum: ['markdown', 'openapi', 'swagger', 'postman'],
    },
    endpoints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
          path: { type: 'string' },
          summary: { type: 'string' },
          description: { type: 'string' },
          parameters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                in: { type: 'string', enum: ['query', 'path', 'header', 'body'] },
                type: { type: 'string' },
                required: { type: 'boolean' },
                description: { type: 'string' },
              },
            },
          },
          requestBody: {
            type: 'object',
            properties: {
              contentType: { type: 'string' },
              schema: { type: 'object' },
              example: { type: 'object' },
            },
          },
          responses: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                schema: { type: 'object' },
                example: { type: 'object' },
              },
            },
          },
        },
      },
    },
    documentation: { type: 'string' },
  },
  required: ['summary', 'format', 'endpoints', 'documentation'],
} as const;

/**
 * SQL Query Schema
 * 用于 gensql 工具的结构化输出
 */
export const SQLQuerySchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    dialect: {
      type: 'string',
      enum: ['postgres', 'mysql', 'sqlite', 'mssql', 'oracle'],
    },
    query: { type: 'string', description: '生成的 SQL 查询' },
    explanation: { type: 'string', description: '查询说明' },
    parameters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    performance: {
      type: 'object',
      properties: {
        estimatedRows: { type: 'number' },
        indexes: { type: 'array', items: { type: 'string' } },
        optimizations: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  required: ['summary', 'dialect', 'query'],
} as const;

/**
 * README Schema
 * 用于 genreadme 工具的结构化输出
 */
export const ReadmeSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    content: { type: 'string', description: '完整的 README 内容' },
    sections: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        installation: { type: 'string' },
        usage: { type: 'string' },
        api: { type: 'string' },
        examples: { type: 'string' },
        contributing: { type: 'string' },
        license: { type: 'string' },
      },
    },
    badges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          url: { type: 'string' },
          imageUrl: { type: 'string' },
        },
      },
    },
  },
  required: ['summary', 'content'],
} as const;

/**
 * UI Component Schema
 * 用于 genui 工具的结构化输出
 */
export const UIComponentSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    framework: {
      type: 'string',
      enum: ['react', 'vue', 'angular', 'svelte', 'html'],
    },
    componentName: { type: 'string' },
    code: { type: 'string', description: '组件代码' },
    props: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          required: { type: 'boolean' },
          default: { type: 'string' },
          description: { type: 'string' },
        },
      },
    },
    styles: { type: 'string', description: '样式代码' },
    usage: { type: 'string', description: '使用示例' },
  },
  required: ['summary', 'framework', 'componentName', 'code'],
} as const;

/**
 * Mock Data Schema
 * 用于 gen_mock 工具的结构化输出
 */
export const MockDataSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    format: {
      type: 'string',
      enum: ['json', 'typescript', 'javascript', 'csv'],
    },
    count: { type: 'number', description: '生成的数据条数' },
    data: {
      type: 'array',
      description: '生成的 Mock 数据',
      items: { type: 'object' },
    },
    schema: {
      type: 'object',
      description: '数据结构定义',
    },
    code: { type: 'string', description: '可直接使用的代码' },
  },
  required: ['summary', 'format', 'count', 'data'],
} as const;

/**
 * Changelog Schema
 * 用于 genchangelog 工具的结构化输出
 */
export const ChangelogSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    version: { type: 'string' },
    date: { type: 'string' },
    content: { type: 'string', description: '完整的 Changelog 内容' },
    changes: {
      type: 'object',
      properties: {
        features: { type: 'array', items: { type: 'string' } },
        fixes: { type: 'array', items: { type: 'string' } },
        breaking: { type: 'array', items: { type: 'string' } },
        deprecated: { type: 'array', items: { type: 'string' } },
        security: { type: 'array', items: { type: 'string' } },
        performance: { type: 'array', items: { type: 'string' } },
        docs: { type: 'array', items: { type: 'string' } },
        chore: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  required: ['summary', 'version', 'content', 'changes'],
} as const;

/**
 * Pull Request Schema
 * 用于 genpr 工具的结构化输出
 */
export const PullRequestSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    title: { type: 'string' },
    description: { type: 'string', description: '完整的 PR 描述' },
    type: {
      type: 'string',
      enum: ['feature', 'bugfix', 'hotfix', 'refactor', 'docs', 'chore'],
    },
    changes: {
      type: 'object',
      properties: {
        added: { type: 'array', items: { type: 'string' } },
        modified: { type: 'array', items: { type: 'string' } },
        removed: { type: 'array', items: { type: 'string' } },
      },
    },
    testing: { type: 'string', description: '测试说明' },
    screenshots: {
      type: 'array',
      items: { type: 'string' },
      description: '截图说明',
    },
    checklist: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'title', 'description', 'type'],
} as const;

/**
 * Code Fix Schema
 * 用于 fix 工具的结构化输出
 */
export const CodeFixSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    fixType: {
      type: 'string',
      enum: ['lint', 'format', 'typescript', 'import', 'syntax'],
    },
    originalCode: { type: 'string' },
    fixedCode: { type: 'string' },
    diff: { type: 'string', description: 'Unified diff' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'number' },
          message: { type: 'string' },
          fixed: { type: 'boolean' },
        },
      },
    },
  },
  required: ['summary', 'fixType', 'fixedCode'],
} as const;

/**
 * Explanation Schema
 * 用于 explain 工具的结构化输出
 */
export const ExplanationSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    overview: { type: 'string', description: '代码概述' },
    purpose: { type: 'string', description: '代码目的' },
    flow: {
      type: 'array',
      description: '执行流程',
      items: {
        type: 'object',
        properties: {
          step: { type: 'number' },
          description: { type: 'string' },
          code: { type: 'string' },
        },
      },
    },
    keyConcepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          concept: { type: 'string' },
          explanation: { type: 'string' },
        },
      },
    },
    complexity: {
      type: 'object',
      properties: {
        time: { type: 'string' },
        space: { type: 'string' },
      },
    },
  },
  required: ['summary', 'overview', 'purpose'],
} as const;

/**
 * Conversion Schema
 * 用于 convert 工具的结构化输出
 */
export const ConversionSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    from: { type: 'string', description: '源格式' },
    to: { type: 'string', description: '目标格式' },
    originalCode: { type: 'string' },
    convertedCode: { type: 'string' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          description: { type: 'string' },
          before: { type: 'string' },
          after: { type: 'string' },
        },
      },
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'from', 'to', 'convertedCode'],
} as const;

/**
 * CSS Order Schema
 * 用于 css_order 工具的结构化输出
 */
export const CSSOrderSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    originalCSS: { type: 'string' },
    orderedCSS: { type: 'string' },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          propertiesCount: { type: 'number' },
          reordered: { type: 'boolean' },
        },
      },
    },
  },
  required: ['summary', 'orderedCSS'],
} as const;

// TypeScript 类型定义
export interface Documentation {
  summary: string;
  docType: 'jsdoc' | 'tsdoc' | 'javadoc' | 'pydoc' | 'godoc';
  documentation: string;
  functions?: Array<{
    name?: string;
    description?: string;
    parameters?: Array<{
      name?: string;
      type?: string;
      description?: string;
      optional?: boolean;
    }>;
    returns?: {
      type?: string;
      description?: string;
    };
    throws?: Array<{
      type?: string;
      description?: string;
    }>;
    examples?: string[];
  }>;
}

export interface APIDocumentation {
  summary: string;
  format: 'markdown' | 'openapi' | 'swagger' | 'postman';
  endpoints: Array<{
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path?: string;
    summary?: string;
    description?: string;
    parameters?: Array<{
      name?: string;
      in?: 'query' | 'path' | 'header' | 'body';
      type?: string;
      required?: boolean;
      description?: string;
    }>;
    requestBody?: {
      contentType?: string;
      schema?: any;
      example?: any;
    };
    responses?: Record<string, {
      description?: string;
      schema?: any;
      example?: any;
    }>;
  }>;
  documentation: string;
}

export interface SQLQuery {
  summary: string;
  dialect: 'postgres' | 'mysql' | 'sqlite' | 'mssql' | 'oracle';
  query: string;
  explanation?: string;
  parameters?: Array<{
    name?: string;
    type?: string;
    description?: string;
  }>;
  performance?: {
    estimatedRows?: number;
    indexes?: string[];
    optimizations?: string[];
  };
}

export interface Readme {
  summary: string;
  content: string;
  sections?: {
    title?: string;
    description?: string;
    installation?: string;
    usage?: string;
    api?: string;
    examples?: string;
    contributing?: string;
    license?: string;
  };
  badges?: Array<{
    name?: string;
    url?: string;
    imageUrl?: string;
  }>;
}

export interface UIComponent {
  summary: string;
  framework: 'react' | 'vue' | 'angular' | 'svelte' | 'html';
  componentName: string;
  code: string;
  props?: Array<{
    name?: string;
    type?: string;
    required?: boolean;
    default?: string;
    description?: string;
  }>;
  styles?: string;
  usage?: string;
}

export interface MockData {
  summary: string;
  format: 'json' | 'typescript' | 'javascript' | 'csv';
  count: number;
  data: any[];
  schema?: any;
  code?: string;
}

export interface Changelog {
  summary: string;
  version: string;
  date: string;
  content: string;
  changes: {
    features?: string[];
    fixes?: string[];
    breaking?: string[];
    deprecated?: string[];
    security?: string[];
    performance?: string[];
    docs?: string[];
    chore?: string[];
  };
}

export interface PullRequest {
  summary: string;
  title: string;
  description: string;
  type: 'feature' | 'bugfix' | 'hotfix' | 'refactor' | 'docs' | 'chore';
  changes?: {
    added?: string[];
    modified?: string[];
    removed?: string[];
  };
  testing?: string;
  screenshots?: string[];
  checklist?: string[];
}

export interface CodeFix {
  summary: string;
  fixType: 'lint' | 'format' | 'typescript' | 'import' | 'syntax';
  originalCode?: string;
  fixedCode: string;
  diff?: string;
  issues?: Array<{
    line?: number;
    message?: string;
    fixed?: boolean;
  }>;
}

export interface Explanation {
  summary: string;
  overview: string;
  purpose: string;
  flow?: Array<{
    step?: number;
    description?: string;
    code?: string;
  }>;
  keyConcepts?: Array<{
    concept?: string;
    explanation?: string;
  }>;
  complexity?: {
    time?: string;
    space?: string;
  };
}

export interface Conversion {
  summary: string;
  from: string;
  to: string;
  originalCode?: string;
  convertedCode: string;
  changes?: Array<{
    type?: string;
    description?: string;
    before?: string;
    after?: string;
  }>;
  warnings?: string[];
}

export interface CSSOrder {
  summary: string;
  originalCSS?: string;
  orderedCSS: string;
  rules?: Array<{
    selector?: string;
    propertiesCount?: number;
    reordered?: boolean;
  }>;
}
