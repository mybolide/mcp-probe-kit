/**
 * 统一输出封装
 * 提供标准化的工具响应格式，支持结构化输出
 */

/**
 * 工具响应内容
 */
export interface ToolContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * 工具响应结果
 */
export interface ToolResponse {
  content: ToolContent[];
  isError?: boolean;
  structuredContent?: any;
  _meta?: Record<string, any>;
}

/**
 * 返回结构化响应
 * 同时包含人类可读的文本和机器可读的结构化数据
 * 
 * @param text - 人类可读的文本内容
 * @param structuredContent - 机器可读的结构化数据
 * @param meta - 可选的元数据
 * @returns 标准工具响应
 */
export function okStructured(
  text: string,
  structuredContent: any,
  meta?: Record<string, any>
): ToolResponse {
  const response: ToolResponse = {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    structuredContent,
  };

  if (meta) {
    response._meta = meta;
  }

  return response;
}
