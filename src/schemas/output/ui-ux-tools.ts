/**
 * UI/UX 工具的结构化输出 Schema
 * 包含: ui_design_system, ui_search, sync_ui_data, design2code, init_component_catalog, render_ui
 */

/**
 * Design System Schema
 * 用于 ui_design_system 工具的结构化输出
 */
export const DesignSystemSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    productType: { type: 'string' },
    colors: {
      type: 'object',
      properties: {
        primary: { type: 'object', additionalProperties: { type: 'string' } },
        secondary: { type: 'object', additionalProperties: { type: 'string' } },
        neutral: { type: 'object', additionalProperties: { type: 'string' } },
        semantic: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
    typography: {
      type: 'object',
      properties: {
        fontFamilies: { type: 'object', additionalProperties: { type: 'string' } },
        fontSizes: { type: 'object', additionalProperties: { type: 'string' } },
        fontWeights: { type: 'object', additionalProperties: { type: 'number' } },
        lineHeights: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
    spacing: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    breakpoints: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          variants: { type: 'array', items: { type: 'string' } },
          props: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    documentation: { type: 'string' },
  },
  required: ['summary', 'productType', 'colors', 'typography'],
} as const;

/**
 * UI Search Result Schema
 * 用于 ui_search 工具的结构化输出
 */
export const UISearchResultSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    query: { type: 'string' },
    category: { type: 'string' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          url: { type: 'string' },
          score: { type: 'number' },
          preview: { type: 'string' },
        },
      },
    },
    totalResults: { type: 'number' },
  },
  required: ['summary', 'query', 'results', 'totalResults'],
} as const;

/**
 * Sync Report Schema
 * 用于 sync_ui_data 工具的结构化输出
 */
export const SyncReportSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    status: {
      type: 'string',
      enum: ['success', 'partial', 'failed'],
    },
    synced: {
      type: 'object',
      properties: {
        colors: { type: 'number' },
        icons: { type: 'number' },
        components: { type: 'number' },
        patterns: { type: 'number' },
      },
    },
    version: { type: 'string' },
    timestamp: { type: 'string' },
    errors: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'status', 'synced'],
} as const;

/**
 * Design2Code Schema
 * 用于 design2code 工具的结构化输出
 */
export const Design2CodeSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    framework: {
      type: 'string',
      enum: ['react', 'vue', 'angular', 'svelte', 'html'],
    },
    componentType: {
      type: 'string',
      enum: ['page', 'component'],
    },
    code: { type: 'string', description: '生成的代码' },
    styles: { type: 'string', description: '样式代码' },
    assets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          url: { type: 'string' },
          localPath: { type: 'string' },
        },
      },
    },
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          path: { type: 'string' },
          props: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  required: ['summary', 'framework', 'componentType', 'code'],
} as const;

/**
 * Component Catalog Schema
 * 用于 init_component_catalog 工具的结构化输出（内部工具）
 */
export const ComponentCatalogSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          description: { type: 'string' },
          props: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: { type: 'string' },
                required: { type: 'boolean' },
                default: { type: 'string' },
              },
            },
          },
          variants: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    catalogPath: { type: 'string' },
  },
  required: ['summary', 'components', 'catalogPath'],
} as const;

/**
 * Render Result Schema
 * 用于 render_ui 工具的结构化输出（内部工具）
 */
export const RenderResultSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    framework: {
      type: 'string',
      enum: ['react', 'vue', 'html'],
    },
    code: { type: 'string', description: '渲染的代码' },
    styles: { type: 'string', description: '应用的样式' },
    usedComponents: {
      type: 'array',
      items: { type: 'string' },
    },
    designTokens: {
      type: 'object',
      description: '使用的设计令牌',
      additionalProperties: { type: 'string' },
    },
  },
  required: ['summary', 'framework', 'code'],
} as const;

// TypeScript 类型定义
export interface DesignSystem {
  summary: string;
  productType: string;
  colors: {
    primary?: Record<string, string>;
    secondary?: Record<string, string>;
    neutral?: Record<string, string>;
    semantic?: Record<string, string>;
  };
  typography: {
    fontFamilies?: Record<string, string>;
    fontSizes?: Record<string, string>;
    fontWeights?: Record<string, number>;
    lineHeights?: Record<string, string>;
  };
  spacing?: Record<string, string>;
  breakpoints?: Record<string, string>;
  components?: Array<{
    name?: string;
    variants?: string[];
    props?: string[];
  }>;
  documentation?: string;
}

export interface UISearchResult {
  summary: string;
  query: string;
  category?: string;
  results: Array<{
    id?: string;
    title?: string;
    description?: string;
    category?: string;
    url?: string;
    score?: number;
    preview?: string;
  }>;
  totalResults: number;
}

export interface SyncReport {
  summary: string;
  status: 'success' | 'partial' | 'failed';
  synced: {
    colors?: number;
    icons?: number;
    components?: number;
    patterns?: number;
  };
  version?: string;
  timestamp?: string;
  errors?: string[];
}

export interface Design2Code {
  summary: string;
  framework: 'react' | 'vue' | 'angular' | 'svelte' | 'html';
  componentType: 'page' | 'component';
  code: string;
  styles?: string;
  assets?: Array<{
    type?: string;
    url?: string;
    localPath?: string;
  }>;
  components?: Array<{
    name?: string;
    path?: string;
    props?: string[];
  }>;
}

export interface ComponentCatalog {
  summary: string;
  components: Array<{
    name?: string;
    category?: string;
    description?: string;
    props?: Array<{
      name?: string;
      type?: string;
      required?: boolean;
      default?: string;
    }>;
    variants?: string[];
  }>;
  catalogPath: string;
}

export interface RenderResult {
  summary: string;
  framework: 'react' | 'vue' | 'html';
  code: string;
  styles?: string;
  usedComponents?: string[];
  designTokens?: Record<string, string>;
}
