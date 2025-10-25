// code_review 工具实现
export async function codeReview(args: any) {
  try {
    const code = args?.code || "";
    const focus = args?.focus || "all"; // quality, security, performance, all

    const message = `请对以下代码进行全面审查：

📝 **代码内容**：
${code || "请提供需要审查的代码"}

🎯 **审查重点**：${focus}

---

## 代码审查清单

### 1️⃣ 代码质量检查

**代码坏味道（Code Smells）**：
- [ ] 重复代码（Duplicated Code）
- [ ] 过长函数（Long Function）> 30 行
- [ ] 过长参数列表（Long Parameter List）> 3 个
- [ ] 复杂条件判断（Complex Conditional）> 3 层嵌套
- [ ] 魔法数字（Magic Numbers）
- [ ] 命名不清晰（Poor Naming）

**设计原则**：
- [ ] 单一职责原则（SRP）
- [ ] 开闭原则（OCP）
- [ ] 接口隔离原则（ISP）
- [ ] 依赖倒置原则（DIP）

### 2️⃣ 安全漏洞检查

**常见漏洞**：
- [ ] SQL 注入风险
- [ ] XSS（跨站脚本）风险
- [ ] CSRF（跨站请求伪造）
- [ ] 硬编码密钥/密码
- [ ] 不安全的随机数生成
- [ ] 路径遍历漏洞
- [ ] 未验证的输入
- [ ] 敏感信息泄露

**安全最佳实践**：
- [ ] 输入验证和过滤
- [ ] 输出编码
- [ ] 使用参数化查询
- [ ] 密码/密钥使用环境变量
- [ ] HTTPS 通信

### 3️⃣ 性能问题检查

**性能风险**：
- [ ] 循环内创建对象
- [ ] 嵌套循环（O(n²) 或更差）
- [ ] 不必要的重复计算
- [ ] 内存泄漏风险
- [ ] 阻塞主线程
- [ ] 大数据量未分页
- [ ] 同步 I/O 操作

**React/Vue 性能**：
- [ ] 未使用 useMemo/useCallback
- [ ] 组件不必要的重渲染
- [ ] 大列表未虚拟化
- [ ] 状态管理不当

### 4️⃣ 最佳实践检查

**TypeScript/JavaScript**：
- [ ] 类型定义完整（避免 any）
- [ ] 错误处理完善（try-catch）
- [ ] 异步操作正确处理
- [ ] 使用 const/let 替代 var
- [ ] 箭头函数合理使用

**命名规范**：
- [ ] 变量：驼峰命名（camelCase）
- [ ] 常量：大写下划线（UPPER_CASE）
- [ ] 类/接口：帕斯卡命名（PascalCase）
- [ ] 文件：短横线命名（kebab-case）
- [ ] 布尔值：is/has/should 前缀

**注释和文档**：
- [ ] 复杂逻辑有注释说明
- [ ] 公共 API 有文档
- [ ] TODO/FIXME 标记清晰

---

## 审查报告格式

**严重问题（🔴 Critical）**：
1. [位置] 问题描述
   - 风险：...
   - 建议：...
   - 修复示例：\`\`\`typescript ... \`\`\`

**警告（🟡 Warning）**：
1. [位置] 问题描述
   - 影响：...
   - 建议：...

**建议（🟢 Suggestion）**：
1. [位置] 改进建议
   - 当前：...
   - 建议：...
   - 收益：...

**优点（✅ Good）**：
- 做得好的地方

---

现在请开始代码审查，生成详细的审查报告。`;

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
          text: `❌ 代码审查失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

