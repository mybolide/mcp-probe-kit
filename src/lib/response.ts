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
 * 返回纯文本响应
 * 
 * @param text - 文本内容
 * @param meta - 可选的元数据
 * @returns 标准工具响应
 */
export function okText(text: string, meta?: Record<string, any>): ToolResponse {
  const response: ToolResponse = {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };

  if (meta) {
    response._meta = meta;
  }

  return response;
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

/**
 * 返回错误响应
 * 
 * @param message - 错误消息
 * @param details - 可选的错误详情
 * @returns 错误响应
 */
export function errorResponse(message: string, details?: any): ToolResponse {
  const text = details
    ? `错误: ${message}\n\n详情:\n${JSON.stringify(details, null, 2)}`
    : `错误: ${message}`;

  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    isError: true,
  };
}

/**
 * 返回图片响应
 * 
 * @param data - Base64 编码的图片数据
 * @param mimeType - MIME 类型（如 'image/png'）
 * @param description - 可选的图片描述
 * @returns 标准工具响应
 */
export function okImage(
  data: string,
  mimeType: string,
  description?: string
): ToolResponse {
  const response: ToolResponse = {
    content: [
      {
        type: 'image',
        data,
        mimeType,
      },
    ],
  };

  if (description) {
    response.content.push({
      type: 'text',
      text: description,
    });
  }

  return response;
}

/**
 * 返回资源响应
 * 
 * @param uri - 资源 URI
 * @param mimeType - MIME 类型
 * @param description - 可选的资源描述
 * @returns 标准工具响应
 */
export function okResource(
  uri: string,
  mimeType: string,
  description?: string
): ToolResponse {
  const response: ToolResponse = {
    content: [
      {
        type: 'resource',
        data: uri,
        mimeType,
      },
    ],
  };

  if (description) {
    response.content.push({
      type: 'text',
      text: description,
    });
  }

  return response;
}
