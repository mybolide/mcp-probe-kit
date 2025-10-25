// debug 工具实现
export async function debug(args: any) {
  try {
    const error = args?.error || "";
    const context = args?.context || "";

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

现在请按照上述步骤分析错误并提供具体的调试方案。`;

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
          text: `❌ 生成调试策略失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

