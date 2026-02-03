import { okText } from "../lib/response.js";

/**
 * Git 工作报告生成工具
 * 返回生成工作报告的指导文本，AI 根据指导执行 Git 命令并分析
 */

// ============================================
// 类型定义
// ============================================

/**
 * 工具输入参数
 */
interface GitWorkReportArgs {
  date?: string;          // 单个日期 (YYYY-M-D 或 YYYY-MM-DD) - 日报模式
  start_date?: string;    // 起始日期 (YYYY-M-D 或 YYYY-MM-DD) - 周期报模式
  end_date?: string;      // 结束日期 (YYYY-M-D 或 YYYY-MM-DD) - 周期报模式
  output_file?: string;   // 可选，输出文件路径
}

// ============================================
// 辅助函数
// ============================================

/**
 * 验证输入参数
 */
function validateArgs(args: GitWorkReportArgs): void {
  const isDaily = !!args.date;
  const isPeriod = !!(args.start_date && args.end_date);
  
  // 检查是否提供了日期参数
  if (!isDaily && !isPeriod) {
    throw new Error("请提供 date（日报）或 start_date + end_date（周期报）");
  }
  
  // 检查参数冲突
  if (isDaily && isPeriod) {
    throw new Error("不能同时使用日报和周期报模式");
  }
  
  // 验证日期格式 (YYYY-M-D 或 YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{1,2}-\d{1,2}$/;
  
  if (args.date && !dateRegex.test(args.date)) {
    throw new Error(`日期格式错误，应为 YYYY-M-D 或 YYYY-MM-DD，当前值: ${args.date}`);
  }
  
  if (isPeriod) {
    if (!dateRegex.test(args.start_date!)) {
      throw new Error(`起始日期格式错误，应为 YYYY-M-D 或 YYYY-MM-DD，当前值: ${args.start_date}`);
    }
    if (!dateRegex.test(args.end_date!)) {
      throw new Error(`结束日期格式错误，应为 YYYY-M-D 或 YYYY-MM-DD，当前值: ${args.end_date}`);
    }
    
    // 验证日期范围合理性
    if (args.start_date! > args.end_date!) {
      throw new Error("结束日期不能早于开始日期");
    }
  }
}

/**
 * 标准化日期格式为 YYYY-MM-DD
 */
function normalizeDate(date: string): string {
  const parts = date.split('-');
  const year = parts[0];
  const month = parts[1].padStart(2, '0');
  const day = parts[2].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 构建指导文本
 */
function buildGuidance(args: GitWorkReportArgs): string {
  const isDaily = !!args.date;
  const dateInfo = isDaily 
    ? `日期：${args.date}` 
    : `日期范围：${args.start_date} 至 ${args.end_date}`;
  
  const outputInfo = args.output_file 
    ? `\n\n## 输出文件\n\n生成报告后，请将内容保存到：\`${args.output_file}\`` 
    : '';

  // 标准化日期格式
  let sinceDate: string;
  let untilDate: string;
  
  if (isDaily) {
    sinceDate = normalizeDate(args.date!);
    untilDate = sinceDate;
  } else {
    sinceDate = normalizeDate(args.start_date!);
    untilDate = normalizeDate(args.end_date!);
  }

  // 计算第二天的日期（用于 --before 参数）
  const nextDay = new Date(untilDate);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().split('T')[0];

  return `# Git 工作报告生成指南

${dateInfo}

## 执行步骤

### 1. 获取提交列表

**方法 1：直接执行命令**

\`\`\`
git log --since=${sinceDate}T00:00:00 --until=${untilDate}T23:59:59 --format=%H
\`\`\`

**方法 2：如果直接命令失败，创建临时脚本执行**

根据操作系统创建对应脚本：

**Windows (PowerShell) - 创建 \`get-commits.ps1\`**：
\`\`\`powershell
# 创建脚本文件
@'
$since = "${sinceDate}T00:00:00"
$until = "${untilDate}T23:59:59"
git log --since=$since --until=$until --format=%H
'@ | Out-File -FilePath get-commits.ps1 -Encoding UTF8

# 执行脚本
powershell -ExecutionPolicy Bypass -File get-commits.ps1

# 删除脚本
Remove-Item get-commits.ps1
\`\`\`

**Linux/Mac (Bash) - 创建 \`get-commits.sh\`**：
\`\`\`bash
# 创建脚本文件
cat > get-commits.sh << 'EOF'
#!/bin/bash
git log --since="${sinceDate}T00:00:00" --until="${untilDate}T23:59:59" --format=%H
EOF

# 执行脚本
bash get-commits.sh

# 删除脚本
rm get-commits.sh
\`\`\`

**如果没有提交记录**，直接输出：
\`\`\`
- 当日无代码提交（Git 无 commit 记录）
\`\`\`

### 2. 获取每个提交的 diff

**方法 1：直接执行命令**

对于每个提交哈希，执行：
\`\`\`
git show <commit_hash>
\`\`\`

**方法 2：如果处理多个提交，使用脚本批量获取**

**Windows (PowerShell) - 创建 \`get-diffs.ps1\`**：
\`\`\`powershell
# 假设提交列表保存在变量 $commits 中（一行一个哈希）
@'
$commits = @(
    "hash1",
    "hash2"
)
foreach ($commit in $commits) {
    Write-Host "=== Commit: $commit ==="
    git show $commit
}
'@ | Out-File -FilePath get-diffs.ps1 -Encoding UTF8

powershell -ExecutionPolicy Bypass -File get-diffs.ps1
Remove-Item get-diffs.ps1
\`\`\`

**Linux/Mac (Bash) - 创建 \`get-diffs.sh\`**：
\`\`\`bash
cat > get-diffs.sh << 'EOF'
#!/bin/bash
commits=(
    "hash1"
    "hash2"
)
for commit in "\${commits[@]}"; do
    echo "=== Commit: $commit ==="
    git show "$commit"
done
EOF

bash get-diffs.sh
rm get-diffs.sh
\`\`\`

### 3. 分析 diff 内容

根据所有 diff 内容，提取实际工作内容。

## 输出要求

- **只输出「工作内容」部分**
- 每条以 \`-\` 开头
- 中文，简洁专业，避免空话
- 格式：**做了什么 + 改了哪里/达到什么效果**
- **不输出**：提交哈希、文件列表原文、统计数据、风险评估、总结段落

## 输出示例

\`\`\`
- 实现了用户认证功能，添加了 JWT token 验证中间件，提升了 API 安全性
- 修复了订单列表分页bug，调整了 SQL 查询逻辑，解决了数据重复显示问题
- 优化了首页加载性能，使用懒加载技术，减少了 40% 的初始加载时间
- 新增了数据导出功能，支持 CSV 和 Excel 格式，方便用户批量处理数据
\`\`\`${outputInfo}

## 注意事项

1. 从 diff 中提取**真实的代码变更**，不要编造内容
2. 关注**业务价值**和**技术改进**，而不是文件名和代码行数
3. 使用**专业术语**，但保持简洁易懂
4. 如果某个提交是重构或优化，说明**具体改进了什么**
5. 如果某个提交修复了 bug，说明**问题是什么、如何解决的**
`;
}

// ============================================
// 主函数
// ============================================

/**
 * Git 工作报告生成工具
 * 
 * @param args 输入参数
 * @returns 工具响应（指导文本）
 */
export async function gitWorkReport(args: GitWorkReportArgs) {
  try {
    // 1. 参数验证
    validateArgs(args);

    // 2. 构建指导文本
    const guidance = buildGuidance(args);

    // 3. 返回指导文本（AI 会根据指导执行 Git 命令并分析）
    return okText(guidance);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return okText(`错误: ${errorMessage}`);
  }
}
