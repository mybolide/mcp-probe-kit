import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { DebugReport } from "../schemas/output/index.js";

// debug 工具实现
export async function debug(args: any) {
  try {
    const parsedArgs = parseArgs<{
      error?: string;
      context?: string;
    }>(args, {
      defaultValues: {
        error: "",
        context: "",
      },
      primaryField: "error", // 纯文本输入默认映射到 error 字段
      fieldAliases: {
        error: ["err", "exception", "错误", "异常"],
        context: ["ctx", "code", "上下文", "代码"],
      },
    });
    
    const error = getString(parsedArgs.error);
    const context = getString(parsedArgs.context);

    const message = `请分析以下错误并提供调试策略：

❌ **错误信息**：
${error || "请提供错误信息（错误消息、堆栈跟踪等）"}

📋 **上下文**：
${context || "请提供相关代码或场景描述"}

---

🔍 **调试分析步骤**：

**第一步：错误分类**
- 确定错误类型（语法错误、运行时错误、逻辑错误）
- 评估错误严重程度（崩溃、功能异常、性能问题）

**第二步：问题定位**
1. 分析错误堆栈，确定出错位置
2. 识别可能的原因（至少列出 3 个）
3. 检查相关代码上下文

**第三步：调试策略**
按优先级列出调试步骤：
1. 快速验证：最可能的原因
2. 添加日志：关键变量和执行路径
3. 断点调试：问题代码段
4. 单元测试：隔离问题
5. 回归测试：确认修复

**第四步：解决方案**
- 临时方案（Quick Fix）
- 根本方案（Root Cause Fix）
- 预防措施（Prevention）

**第五步：验证清单**
- [ ] 错误已修复
- [ ] 测试通过
- [ ] 无副作用
- [ ] 添加防御性代码
- [ ] 更新文档

---

💡 **常见错误模式**：
- NullPointerException → 检查空值处理
- ReferenceError → 检查变量声明和作用域
- TypeError → 检查类型转换和数据结构
- TimeoutError → 检查异步操作和网络请求
- MemoryError → 检查内存泄漏和资源释放

---

## 📤 输出格式要求

请严格按以下 JSON 格式输出分析结果：

\`\`\`json
{
  "error_analysis": {
    "type": "错误类型（SyntaxError/TypeError/LogicError等）",
    "severity": "critical|high|medium|low",
    "root_cause": "根本原因分析"
  },
  "possible_causes": [
    {
      "probability": "high|medium|low",
      "description": "可能原因描述",
      "evidence": "支持证据"
    }
  ],
  "debug_strategy": [
    {
      "step": 1,
      "action": "调试步骤描述",
      "expected_result": "预期结果"
    }
  ],
  "solutions": {
    "quick_fix": "临时解决方案",
    "root_fix": "根本解决方案",
    "prevention": "预防措施"
  }
}
\`\`\`

## ⚠️ 边界约束

- ❌ 仅分析和建议，不自动修改代码
- ❌ 不执行代码或命令
- ✅ 输出结构化调试策略和解决方案

现在请按照上述步骤分析错误并提供具体的调试方案。`;

    // 创建结构化数据
    const structuredData: DebugReport = {
      summary: "错误分析完成，请查看详细报告",
      rootCause: "", // AI 会填充
      errorType: "unknown", // AI 会填充
      solutions: [], // AI 会填充
    };

    return okStructured(
      message,
      structuredData,
      {
        schema: (await import('../schemas/output/core-tools.js')).DebugReportSchema,
      }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    
    return okStructured(
      `❌ 生成调试策略失败: ${errorMessage}`,
      {
        summary: `调试分析失败: ${errorMessage}`,
        rootCause: errorMessage,
        errorType: "unknown",
        solutions: [],
      },
      {
        schema: (await import('../schemas/output/core-tools.js')).DebugReportSchema,
      }
    );
  }
}

