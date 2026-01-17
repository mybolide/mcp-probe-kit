/**
 * 通用参数解析工具
 * 支持自然语言输入，让 AI 工具更易用
 * 
 * 设计理念：
 * - AI 工具应该接受自然语言，而不是强制 JSON 格式
 * - 用户可以直接说 "帮我生成 commit 消息" 而不是 {"changes": "..."}
 * - 智能推断用户意图，自动映射到对应参数
 */

/**
 * 解析工具参数，支持多种格式
 * @param args - 原始参数（对象、字符串、自然语言等）
 * @param config - 配置选项
 * @returns 解析后的参数对象
 */
export function parseArgs<T extends Record<string, any>>(
  args: any,
  config: {
    defaultValues?: Partial<T>;
    primaryField?: string; // 主要字段，用于接收纯文本输入
    fieldAliases?: Record<string, string[]>; // 字段别名映射
  } = {}
): T {
  const { defaultValues = {}, primaryField, fieldAliases = {} } = config;
  let parsedArgs: any = {};

  // 1. 处理 null/undefined - 返回默认值
  if (args === null || args === undefined) {
    return { ...defaultValues } as T;
  }

  // 2. 处理字符串类型 - 最常见的自然语言输入
  if (typeof args === "string") {
    const trimmed = args.trim();
    
    // 2.1 尝试解析为 JSON（兼容标准格式）
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        parsedArgs = JSON.parse(trimmed);
      } catch {
        // JSON 解析失败，当作普通文本处理
        parsedArgs = mapStringToArgs(trimmed, primaryField, defaultValues);
      }
    }
    // 2.2 检查是否是 key=value 格式（包含 = 且包含 & 或 ,）
    else if (trimmed.includes("=") && /[&,]/.test(trimmed)) {
      parsedArgs = parseKeyValueString(trimmed);
    }
    // 2.3 纯自然语言 - 智能映射到主字段
    else {
      parsedArgs = mapStringToArgs(trimmed, primaryField, defaultValues);
    }
  }
  // 3. 处理对象类型 - 标准 JSON 对象
  else if (typeof args === "object" && !Array.isArray(args)) {
    parsedArgs = normalizeObjectKeys(args, fieldAliases);
  }
  // 4. 其他类型
  else {
    parsedArgs = { value: args };
  }

  // 5. 合并默认值
  return { ...defaultValues, ...parsedArgs } as T;
}

/**
 * 将字符串映射到参数对象
 * 智能推断用户意图
 */
function mapStringToArgs(
  text: string,
  primaryField: string | undefined,
  defaultValues: Record<string, any>
): Record<string, any> {
  // 如果指定了主字段，直接映射
  if (primaryField) {
    return { [primaryField]: text };
  }
  
  // 否则映射到第一个默认值字段
  const firstKey = Object.keys(defaultValues)[0];
  if (firstKey) {
    return { [firstKey]: text };
  }
  
  // 兜底：使用通用字段名
  return { input: text };
}

/**
 * 解析 key=value 格式的字符串
 * 例如: "changes=fix bug&type=fixed"
 */
function parseKeyValueString(str: string): Record<string, string> {
  const result: Record<string, string> = {};
  
  // 支持 & 或 , 作为分隔符
  const pairs = str.split(/[&,]/);
  
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split("=");
    if (key) {
      const value = valueParts.join("=").trim();
      result[key.trim()] = value || "";
    }
  }
  
  return result;
}

/**
 * 规范化对象的键名，支持别名映射
 * 例如: { msg: "..." } -> { message: "..." }
 */
function normalizeObjectKeys(
  obj: Record<string, any>,
  aliases: Record<string, string[]>
): Record<string, any> {
  const result: Record<string, any> = { ...obj };
  
  // 遍历别名映射，将别名转换为标准字段名
  for (const [standardKey, aliasList] of Object.entries(aliases)) {
    for (const alias of aliasList) {
      if (obj[alias] !== undefined && obj[standardKey] === undefined) {
        result[standardKey] = obj[alias];
        delete result[alias];
        break;
      }
    }
  }
  
  return result;
}

/**
 * 验证必填参数
 * @param args - 参数对象
 * @param requiredFields - 必填字段列表
 * @throws Error 如果缺少必填参数
 */
export function validateRequired(
  args: Record<string, any>,
  requiredFields: string[]
): void {
  const missing = requiredFields.filter(
    (field) => args[field] === undefined || args[field] === null || args[field] === ""
  );

  if (missing.length > 0) {
    throw new Error(`缺少必填参数: ${missing.join(", ")}`);
  }
}

/**
 * 安全地获取字符串参数
 */
export function getString(value: any, defaultValue = ""): string {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  return String(value);
}

/**
 * 安全地获取数字参数
 */
export function getNumber(value: any, defaultValue = 0): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * 安全地获取布尔参数
 */
export function getBoolean(value: any, defaultValue = false): boolean {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true" || value === "1";
  }
  return Boolean(value);
}
