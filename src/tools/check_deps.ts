import { okStructured } from "../lib/response.js";
import type { DependencyReport } from "../schemas/output/project-tools.js";

// check_deps 工具实现（无参数）
export async function checkDeps(_args: any) {
  try {
    const message = `请分析项目依赖的健康状况：

---

## 依赖分析步骤

### 第一步：获取依赖信息

执行以下命令：
\`\`\`bash
# 查看 package.json
cat package.json

# 检查过期依赖
npm outdated

# 检查安全漏洞
npm audit

# 查看依赖树
npm list --depth=0

# 分析包大小
npm ls --prod --parseable | xargs du -sh
\`\`\`

### 第二步：依赖健康度检查

**1️⃣ 版本检查**

检查项：
- [ ] 依赖版本是否过旧（> 1 年未更新）
- [ ] 是否有 Major 版本更新可用
- [ ] 是否使用了废弃的包
- [ ] 版本锁定策略（^、~、固定版本）

**2️⃣ 安全漏洞检查**

分析 \`npm audit\` 结果：
- 🔴 Critical：立即修复
- 🟠 High：尽快修复
- 🟡 Moderate：计划修复
- 🟢 Low：可选修复

**3️⃣ 依赖体积分析**

检查项：
- [ ] 单个依赖是否过大（> 10MB）
- [ ] 是否有轻量级替代方案
- [ ] Tree-shaking 优化机会
- [ ] 是否可以按需导入

**4️⃣ 依赖健康度评估**

评估指标：
- 维护状态（活跃/停止维护）
- 社区活跃度（GitHub Stars/Issues）
- 发布频率
- 文档质量
- TypeScript 支持

**5️⃣ 未使用依赖检查**

查找方法：
\`\`\`bash
# 使用 depcheck
npx depcheck

# 手动检查
grep -r "from 'package-name'" src/
\`\`\`

---

## 依赖分析报告

### 📊 依赖统计

**总体情况**：
- Dependencies: X 个
- DevDependencies: Y 个
- 总大小: Z MB

**版本分布**：
- 最新版本: X 个
- 需要更新: Y 个
- 已废弃: Z 个

### 🔴 严重问题

**安全漏洞**：
1. **package-name@version**
   - 漏洞等级：Critical
   - CVE 编号：CVE-2024-XXXX
   - 影响：...
   - 修复方案：升级到 version X.X.X
   - 命令：\`npm install package-name@X.X.X\`

**废弃包**：
1. **package-name**
   - 状态：已停止维护
   - 最后更新：2020-01-01
   - 替代方案：alternative-package
   - 迁移指南：...

### 🟡 建议更新

**可用更新**：
| 包名 | 当前版本 | 最新版本 | 类型 | 优先级 |
|------|---------|---------|------|--------|
| pkg1 | 1.0.0 | 2.0.0 | Major | 中 |
| pkg2 | 1.5.0 | 1.8.0 | Minor | 低 |

**更新建议**：
1. **Major 更新**（需要测试）：
   - \`npm install pkg1@2.0.0\`
   - 查看 Breaking Changes

2. **Minor/Patch 更新**（风险较低）：
   - \`npm update\`

### 🟢 优化建议

**体积优化**：
1. **large-package (15MB)**
   - 建议：使用 tree-shaking
   - 或替换为：lighter-alternative (2MB)
   - 预计减少：13MB

**未使用依赖**：
1. unused-package
   - 建议：移除
   - 命令：\`npm uninstall unused-package\`

**重复依赖**：
1. package-name 存在多个版本
   - 建议：统一版本
   - 使用：\`npm dedupe\`

---

## 升级计划

### 立即处理（本周）
1. 修复 Critical/High 安全漏洞
2. 移除未使用的依赖
3. 更新 Patch 版本

### 短期计划（本月）
1. 更新 Minor 版本
2. 替换废弃的包
3. 优化依赖体积

### 长期计划（本季度）
1. 评估 Major 版本更新
2. 重构依赖架构
3. 定期审查依赖健康度

---

## 预防措施

**最佳实践**：
1. 使用 \`package-lock.json\` 锁定版本
2. 定期运行 \`npm audit\`
3. 使用 Dependabot 自动更新
4. 评估新依赖前检查健康度
5. 优先选择活跃维护的包

**CI/CD 集成**：
\`\`\`yaml
# GitHub Actions 示例
- name: Audit dependencies
  run: npm audit --audit-level=moderate
\`\`\`

---

现在请开始依赖分析，生成详细的分析报告和升级计划。`;

    // 创建结构化数据对象
    const structuredData: DependencyReport = {
      summary: "依赖健康度分析",
      totalDependencies: 0,
      outdated: [],
      vulnerabilities: [],
      unused: [],
      recommendations: [
        "运行 npm outdated 检查过期依赖",
        "运行 npm audit 检查安全漏洞",
        "使用 depcheck 查找未使用的依赖",
        "定期更新依赖以保持项目健康"
      ]
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/project-tools.js")).DependencyReportSchema,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    
    const errorData: DependencyReport = {
      summary: "依赖分析失败",
      totalDependencies: 0,
      recommendations: [errorMessage]
    };
    
    return okStructured(`❌ 依赖分析失败: ${errorMessage}`, errorData, {
      schema: (await import("../schemas/output/project-tools.js")).DependencyReportSchema,
    });
  }
}

