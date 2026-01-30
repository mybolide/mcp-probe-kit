/**
 * 产品设计工具的结构化输出 Schema
 * 包含: gen_prd, gen_prototype, interview
 */

export const GenPrdSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    productName: { type: 'string' },
    docsDir: { type: 'string' },
    filePath: { type: 'string' },
    content: { type: 'string', description: 'PRD 文档内容' },
  },
  required: ['summary', 'productName', 'filePath', 'content'],
} as const;

export const GenPrototypeSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    docsDir: { type: 'string' },
    source: {
      type: 'object',
      properties: {
        prdPath: { type: 'string' },
        description: { type: 'string' },
      },
    },
    indexPath: { type: 'string' },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          path: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['name', 'path'],
      },
    },
    content: { type: 'string', description: '原型索引内容或说明' },
  },
  required: ['summary', 'docsDir', 'indexPath', 'pages', 'content'],
} as const;

export const InterviewReportSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    mode: {
      type: 'string',
      enum: ['usage', 'questions', 'record'],
    },
    featureName: { type: 'string' },
    filePath: { type: 'string' },
    content: { type: 'string', description: '访谈文本或记录内容' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          required: { type: 'boolean' },
          placeholder: { type: 'string' },
        },
        required: ['id', 'question'],
      },
    },
    nextSteps: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['summary', 'mode', 'content'],
} as const;

export interface GenPrdReport {
  summary: string;
  productName: string;
  docsDir?: string;
  filePath: string;
  content: string;
}

export interface GenPrototypeReport {
  summary: string;
  docsDir: string;
  source?: {
    prdPath?: string;
    description?: string;
  };
  indexPath: string;
  pages: Array<{
    name: string;
    path: string;
    description?: string;
  }>;
  content: string;
}

export interface InterviewReport {
  summary: string;
  mode: 'usage' | 'questions' | 'record';
  featureName?: string;
  filePath?: string;
  content: string;
  questions?: Array<{
    id: string;
    question: string;
    required?: boolean;
    placeholder?: string;
  }>;
  nextSteps?: string[];
}
