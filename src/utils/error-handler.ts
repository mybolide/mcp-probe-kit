/**
 * 统一错误处理系统
 * 
 * 功能：
 * 1. 错误分类和友好提示
 * 2. 错误日志记录
 * 3. 统一错误响应格式
 */

/**
 * 错误类型枚举
 */
export enum ErrorType {
  USER_ERROR = 'UserError',           // 用户输入错误（如参数缺失、格式错误）
  VALIDATION_ERROR = 'ValidationError', // 数据验证错误
  FILE_SYSTEM_ERROR = 'FileSystemError', // 文件系统错误（读写失败）
  NETWORK_ERROR = 'NetworkError',     // 网络请求错误
  TOOL_ERROR = 'ToolError',           // 工具内部错误
  SYSTEM_ERROR = 'SystemError',       // 系统级错误（未预期的错误）
}

/**
 * 自定义错误类
 */
export class ToolkitError extends Error {
  type: ErrorType;
  originalError?: Error;
  context?: Record<string, any>;

  constructor(
    message: string,
    type: ErrorType = ErrorType.SYSTEM_ERROR,
    originalError?: Error,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ToolkitError';
    this.type = type;
    this.originalError = originalError;
    this.context = context;
  }
}

/**
 * 错误日志记录器
 */
export class ErrorLogger {
  private static instance: ErrorLogger;
  
  private constructor() {}
  
  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  /**
   * 记录错误到 stderr
   */
  log(error: ToolkitError | Error, toolName: string, additionalInfo?: Record<string, any>) {
    const timestamp = new Date().toISOString();
    const errorType = error instanceof ToolkitError ? error.type : ErrorType.SYSTEM_ERROR;
    
    const logEntry = {
      timestamp,
      tool: toolName,
      errorType,
      message: error.message,
      stack: error.stack,
      context: error instanceof ToolkitError ? error.context : undefined,
      additionalInfo,
    };

    // 输出到 stderr（不影响工具的正常输出）
    console.error('[MCP Probe Kit Error]', JSON.stringify(logEntry, null, 2));
  }
}

/**
 * 创建用户友好的错误消息
 */
export function createUserFriendlyMessage(error: ToolkitError | Error, toolName: string): string {
  if (error instanceof ToolkitError) {
    switch (error.type) {
      case ErrorType.USER_ERROR:
        return `❌ 参数错误: ${error.message}\n\n💡 提示: 请检查输入参数是否正确。`;

      case ErrorType.VALIDATION_ERROR:
        return `❌ 验证失败: ${error.message}\n\n💡 提示: 请确保提供的数据符合要求。`;

      case ErrorType.FILE_SYSTEM_ERROR:
        return `❌ 文件操作失败: ${error.message}\n\n💡 提示: 请检查文件路径是否正确，以及是否有相应的读写权限。`;

      case ErrorType.NETWORK_ERROR:
        return `❌ 网络请求失败: ${error.message}\n\n💡 提示: 请检查网络连接，或稍后重试。`;

      case ErrorType.TOOL_ERROR:
        return `❌ 工具执行失败: ${error.message}\n\n💡 提示: 这可能是工具内部的问题，请联系开发者。`;

      case ErrorType.SYSTEM_ERROR:
      default:
        return `❌ 系统错误: ${error.message}\n\n💡 提示: 这是一个意外错误，请查看日志或联系开发者。`;
    }
  }

  // 普通 Error 对象
  return `❌ ${toolName} 执行失败: ${error.message}\n\n💡 提示: 请查看错误信息并重试。`;
}

/**
 * 统一错误处理函数
 * 
 * @param error - 捕获的错误
 * @param toolName - 工具名称
 * @param context - 额外上下文信息
 * @returns MCP 工具响应格式
 */
export function handleToolError(
  error: unknown,
  toolName: string,
  context?: Record<string, any>
): {
  content: Array<{ type: string; text: string }>;
  isError: true;
} {
  // 转换为 ToolkitError（如果不是）
  let toolkitError: ToolkitError | Error;
  
  if (error instanceof ToolkitError) {
    toolkitError = error;
  } else if (error instanceof Error) {
    toolkitError = error;
  } else {
    // 非 Error 对象（如字符串、数字等）
    toolkitError = new ToolkitError(
      String(error),
      ErrorType.SYSTEM_ERROR,
      undefined,
      context
    );
  }

  // 记录错误日志
  const logger = ErrorLogger.getInstance();
  logger.log(toolkitError, toolName, context);

  // 创建用户友好的错误消息
  const userMessage = createUserFriendlyMessage(toolkitError, toolName);

  // 返回 MCP 标准错误响应
  return {
    content: [
      {
        type: 'text',
        text: userMessage,
      },
    ],
    isError: true,
  };
}

/**
 * 便捷函数：创建用户错误
 */
export function createUserError(message: string, context?: Record<string, any>): ToolkitError {
  return new ToolkitError(message, ErrorType.USER_ERROR, undefined, context);
}

/**
 * 便捷函数：创建验证错误
 */
export function createValidationError(message: string, context?: Record<string, any>): ToolkitError {
  return new ToolkitError(message, ErrorType.VALIDATION_ERROR, undefined, context);
}

/**
 * 便捷函数：创建文件系统错误
 */
export function createFileSystemError(message: string, originalError?: Error, context?: Record<string, any>): ToolkitError {
  return new ToolkitError(message, ErrorType.FILE_SYSTEM_ERROR, originalError, context);
}

/**
 * 便捷函数：创建网络错误
 */
export function createNetworkError(message: string, originalError?: Error, context?: Record<string, any>): ToolkitError {
  return new ToolkitError(message, ErrorType.NETWORK_ERROR, originalError, context);
}

/**
 * 便捷函数：创建工具错误
 */
export function createToolError(message: string, originalError?: Error, context?: Record<string, any>): ToolkitError {
  return new ToolkitError(message, ErrorType.TOOL_ERROR, originalError, context);
}

/**
 * 安全地获取错误消息（防止错误对象为 null/undefined）
 */
export function safeGetErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
