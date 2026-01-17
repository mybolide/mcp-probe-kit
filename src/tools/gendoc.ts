import { parseArgs, getString } from "../utils/parseArgs.js";

// gendoc 工具实现
export async function gendoc(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      style?: string;
      lang?: string;
    }>(args, {
      defaultValues: {
        code: "",
        style: "jsdoc",
        lang: "zh",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "src", "代码", "function"],
        style: ["format", "type", "风格", "注释风格"],
        lang: ["language", "语言"],
      },
    });
    
    const code = getString(parsedArgs.code);
    const style = getString(parsedArgs.style) || "jsdoc"; // jsdoc, tsdoc, javadoc
    const lang = getString(parsedArgs.lang) || "zh"; // zh, en

    const message = `请为以下代码生成详细的注释文档：

📝 **代码内容**：
${code || "请提供需要生成注释的代码"}

📖 **注释风格**：${style}
🌐 **语言**：${lang === "zh" ? "中文" : "English"}

---

## 注释生成指南

### JSDoc/TSDoc 格式

**函数注释模板**：
\`\`\`typescript
/**
 * 函数简短描述（一句话）
 * 
 * 详细描述功能、用途、使用场景（可选，多行）
 * 
 * @param {类型} 参数名 - 参数描述
 * @param {类型} 参数名 - 参数描述
 * @returns {类型} 返回值描述
 * @throws {ErrorType} 抛出异常的情况
 * 
 * @example
 * // 使用示例
 * const result = functionName(arg1, arg2);
 * console.log(result); // 输出: ...
 * 
 * @see 相关函数或文档链接
 * @since 1.0.0
 * @deprecated 使用 newFunction 替代（如果已废弃）
 */
function functionName(param1, param2) {
  // ...
}
\`\`\`

**类注释模板**：
\`\`\`typescript
/**
 * 类简短描述
 * 
 * 详细描述类的职责、使用场景
 * 
 * @class
 * @example
 * const instance = new ClassName(param);
 * instance.method();
 */
class ClassName {
  /**
   * 构造函数描述
   * @param {类型} param - 参数描述
   */
  constructor(param) {}
  
  /**
   * 方法描述
   * @returns {类型} 返回值描述
   */
  method() {}
}
\`\`\`

**接口注释模板**：
\`\`\`typescript
/**
 * 接口描述
 * 
 * @interface
 */
interface InterfaceName {
  /** 属性描述 */
  property: string;
  
  /**
   * 方法描述
   * @param {类型} param - 参数描述
   * @returns {类型} 返回值描述
   */
  method(param: string): void;
}
\`\`\`

**类型注释模板**：
\`\`\`typescript
/**
 * 类型描述
 * 
 * @typedef {Object} TypeName
 * @property {string} prop1 - 属性 1 描述
 * @property {number} prop2 - 属性 2 描述
 */
type TypeName = {
  prop1: string;
  prop2: number;
};
\`\`\`

---

## 注释内容要求

### 必须包含

1. **功能描述**
   - 简短说明（一句话）
   - 详细说明（用途、场景、原理）

2. **参数说明**
   - 参数类型
   - 参数含义
   - 是否可选
   - 默认值（如有）
   - 取值范围/约束（如有）

3. **返回值**
   - 返回类型
   - 返回值含义
   - 可能的返回值

4. **异常情况**
   - 可能抛出的异常
   - 抛出条件

5. **使用示例**
   - 基本用法
   - 典型场景
   - 边界情况

### 可选包含

1. **复杂度**：\`@complexity O(n)\`
2. **版本信息**：\`@since 1.0.0\`
3. **作者**：\`@author Kyle\`
4. **废弃信息**：\`@deprecated\`
5. **相关链接**：\`@see\`
6. **待办事项**：\`@todo\`

---

## 注释质量标准

**好的注释**：
- ✅ 说明"为什么"，而不只是"做什么"
- ✅ 描述边界条件和特殊情况
- ✅ 提供有意义的示例
- ✅ 保持与代码同步
- ✅ 使用清晰简洁的语言

**避免的注释**：
- ❌ 重复代码内容的注释
- ❌ 过时的注释
- ❌ 误导性的注释
- ❌ 废话注释（如：\`// 定义变量 x\`）

---

## 特殊注释标记

**标记类型**：
\`\`\`typescript
// TODO: 待实现的功能
// FIXME: 需要修复的问题
// HACK: 临时解决方案
// NOTE: 重要说明
// WARNING: 警告信息
// OPTIMIZE: 可优化的地方
\`\`\`

---

---

## ⚠️ 边界约束

- ❌ 仅输出注释，不改变代码逻辑
- ❌ 不执行代码或命令
- ✅ 补全参数/返回值/异常/示例说明
- ✅ 输出带完整注释的代码

现在请为代码生成${lang === "zh" ? "中文" : "英文"}的${style}风格注释文档，包括：
1. 完整的函数/类/接口注释
2. 复杂逻辑的行内注释
3. 使用示例
4. 特殊情况说明`;

    return {
      content: [
        {
          type: "text",
          text: message,
        },
      ],
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ 生成注释失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

