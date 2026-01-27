/**
 * Elicitation 辅助模块
 * 
 * MCP 2025-11-25 Elicitation 支持
 * 提供标准化的用户交互能力
 * 
 * 注意：当前版本通过文本方式实现交互（向后兼容）
 * 未来可以升级为真正的 Elicitation API 调用
 */

/**
 * Elicitation 表单字段
 */
export interface ElicitationField {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description?: string;
  enum?: string[];
  default?: any;
  required?: boolean;
}

/**
 * Elicitation 表单 Schema
 */
export interface ElicitationFormSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    default?: any;
  }>;
  required?: string[];
}

/**
 * 将字段列表转换为 JSON Schema
 * 
 * @param fields - 字段列表
 * @returns JSON Schema
 */
export function fieldsToSchema(fields: ElicitationField[]): ElicitationFormSchema {
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const field of fields) {
    properties[field.name] = {
      type: field.type,
      description: field.description,
    };

    if (field.enum) {
      properties[field.name].enum = field.enum;
    }

    if (field.default !== undefined) {
      properties[field.name].default = field.default;
    }

    if (field.required) {
      required.push(field.name);
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined,
  };
}

/**
 * 生成文本格式的问题列表（回退方案）
 * 
 * @param message - 提示消息
 * @param fields - 字段列表
 * @returns 格式化的文本
 */
export function generateTextQuestions(
  message: string,
  fields: ElicitationField[]
): string {
  const lines: string[] = [];

  lines.push("# ❓ 需要你的输入");
  lines.push("");
  lines.push(message);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const required = field.required ? "**[必答]**" : "_[可选]_";
    
    lines.push(`### ${i + 1}. ${field.description || field.name} ${required}`);
    lines.push("");

    if (field.enum && field.enum.length > 0) {
      lines.push("**可选项**:");
      for (const option of field.enum) {
        lines.push(`- ${option}`);
      }
      lines.push("");
    }

    if (field.default !== undefined) {
      lines.push(`_默认值: ${field.default}_`);
      lines.push("");
    }

    lines.push(`**字段名**: \`${field.name}\``);
    lines.push(`**类型**: ${field.type}`);
    lines.push("");
    lines.push("**你的回答**: ");
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("💡 **提示**: 请回答上述问题，我会根据你的回答继续工作。");

  return lines.join("\n");
}

/**
 * 检查客户端是否支持 Elicitation
 * 
 * 注意：当前版本始终返回 false（使用文本回退）
 * 未来可以通过 server.getClientCapabilities() 检测
 * 
 * @returns 是否支持 Elicitation
 */
export function supportsElicitation(): boolean {
  // TODO: 实现真正的能力检测
  // const capabilities = server.getClientCapabilities();
  // return !!capabilities?.elicitation;
  return false;
}

/**
 * 创建 Elicitation 请求（未来实现）
 * 
 * @param message - 提示消息
 * @param fields - 字段列表
 * @returns Elicitation 结果
 */
export async function createElicitation(
  message: string,
  fields: ElicitationField[]
): Promise<Record<string, any>> {
  // TODO: 实现真正的 Elicitation API 调用
  // const schema = fieldsToSchema(fields);
  // const result = await server.elicitInput({
  //   mode: 'form',
  //   message,
  //   requestedSchema: schema,
  // });
  // return result.data;

  throw new Error('Elicitation not yet implemented. Use text-based fallback.');
}

/**
 * 智能提问：优先使用 Elicitation，回退到文本
 * 
 * @param message - 提示消息
 * @param fields - 字段列表
 * @returns 格式化的文本（当前版本）
 */
export function smartAsk(
  message: string,
  fields: ElicitationField[]
): string {
  // 当前版本：始终使用文本回退
  // 未来版本：检测客户端能力，优先使用 Elicitation
  
  if (supportsElicitation()) {
    // 未来：返回 Elicitation 请求
    // return createElicitation(message, fields);
  }

  // 回退：返回文本格式
  return generateTextQuestions(message, fields);
}
