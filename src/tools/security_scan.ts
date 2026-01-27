/**
 * security_scan 工具
 * 
 * 功能：代码安全扫描，检测常见漏洞和不安全编码实践
 * 模式：指令生成器模式 - 返回安全检查指南，由 AI 执行实际分析
 */

const PROMPT_TEMPLATE = `# 安全扫描指南

## 🎯 扫描目标

**扫描类型**: {scan_type}
**编程语言**: {language}

**待扫描代码**:
\`\`\`{language}
{code}
\`\`\`

---

## 📋 安全检查清单

### 1. 注入类漏洞 (Injection)

#### 1.1 SQL 注入 (CWE-89)
- [ ] 检查是否使用字符串拼接构建 SQL
- [ ] 检查是否使用参数化查询/预编译语句
- [ ] 检查 ORM 是否正确使用

**危险模式**:
\`\`\`
// ❌ 危险
query = "SELECT * FROM users WHERE id = " + userId
db.query(\`SELECT * FROM users WHERE name = '\${name}'\`)

// ✅ 安全
query = "SELECT * FROM users WHERE id = ?"
db.query("SELECT * FROM users WHERE name = $1", [name])
\`\`\`

#### 1.2 XSS 跨站脚本 (CWE-79)
- [ ] 检查用户输入是否直接输出到 HTML
- [ ] 检查是否使用 innerHTML/dangerouslySetInnerHTML
- [ ] 检查是否正确转义特殊字符

**危险模式**:
\`\`\`
// ❌ 危险
element.innerHTML = userInput
<div dangerouslySetInnerHTML={{__html: userContent}} />

// ✅ 安全
element.textContent = userInput
使用 DOMPurify 等库清理 HTML
\`\`\`

#### 1.3 命令注入 (CWE-78)
- [ ] 检查 exec/spawn/system 是否拼接用户输入
- [ ] 检查是否使用白名单验证

**危险模式**:
\`\`\`
// ❌ 危险
exec("ls " + userPath)
child_process.exec(\`git clone \${repoUrl}\`)

// ✅ 安全
execFile("ls", [userPath])
使用白名单验证输入
\`\`\`

#### 1.4 路径遍历 (CWE-22)
- [ ] 检查文件路径是否包含用户输入
- [ ] 检查是否验证路径在允许范围内

---

### 2. 认证授权问题 (Authentication & Authorization)

#### 2.1 硬编码凭证 (CWE-798)
- [ ] 搜索: password, secret, key, token, api_key
- [ ] 检查配置文件中的明文密码
- [ ] 检查注释中的凭证信息

**危险模式**:
\`\`\`
// ❌ 危险
const password = "admin123"
const apiKey = "sk-xxxxxxxxxxxx"
// TODO: 临时密码 test123

// ✅ 安全
const password = process.env.DB_PASSWORD
const apiKey = config.get("apiKey")
\`\`\`

#### 2.2 弱认证 (CWE-287)
- [ ] 检查密码强度验证
- [ ] 检查是否有暴力破解防护
- [ ] 检查 Session 管理

#### 2.3 权限检查缺失 (CWE-862)
- [ ] 检查敏感操作是否验证权限
- [ ] 检查是否存在越权访问风险

---

### 3. 加密安全问题 (Cryptography)

#### 3.1 弱哈希算法 (CWE-328)
- [ ] 检查是否使用 MD5/SHA1 存储密码
- [ ] 检查是否使用适当的密码哈希（bcrypt, argon2）

**危险模式**:
\`\`\`
// ❌ 危险
crypto.createHash('md5').update(password)
crypto.createHash('sha1').update(password)

// ✅ 安全
bcrypt.hash(password, saltRounds)
argon2.hash(password)
\`\`\`

#### 3.2 不安全随机数 (CWE-330)
- [ ] 检查安全相关场景是否使用 Math.random()
- [ ] 检查是否使用加密安全的随机数生成器

**危险模式**:
\`\`\`
// ❌ 危险（用于安全场景）
const token = Math.random().toString(36)

// ✅ 安全
const token = crypto.randomBytes(32).toString('hex')
\`\`\`

#### 3.3 弱加密算法 (CWE-327)
- [ ] 检查是否使用 DES/3DES/RC4
- [ ] 检查 AES 是否使用安全模式（GCM）

---

### 4. 敏感数据泄露 (Sensitive Data Exposure)

#### 4.1 日志泄露 (CWE-532)
- [ ] 检查日志是否包含密码、token、个人信息
- [ ] 检查错误日志是否泄露敏感信息

**危险模式**:
\`\`\`
// ❌ 危险
console.log("User login:", { username, password })
logger.info("API call with token:", apiToken)

// ✅ 安全
console.log("User login:", { username, password: "***" })
logger.info("API call with token:", maskToken(apiToken))
\`\`\`

#### 4.2 错误信息泄露 (CWE-209)
- [ ] 检查是否向用户返回详细错误信息
- [ ] 检查是否暴露堆栈跟踪

#### 4.3 注释中的敏感信息
- [ ] 检查注释中是否包含密码、密钥
- [ ] 检查 TODO/FIXME 中的敏感信息

---

### 5. 其他安全问题

#### 5.1 不安全的依赖
- [ ] 检查是否使用已知漏洞的依赖版本

#### 5.2 CORS 配置
- [ ] 检查是否使用 Access-Control-Allow-Origin: *

#### 5.3 不安全的反序列化 (CWE-502)
- [ ] 检查是否反序列化不可信数据

---

## 📊 报告模板

### 漏洞摘要

| 严重程度 | 数量 | 说明 |
|----------|------|------|
| 🔴 Critical | 0 | 需立即修复 |
| 🟠 High | 0 | 尽快修复 |
| 🟡 Medium | 0 | 计划修复 |
| 🔵 Low | 0 | 建议修复 |
| ⚪ Info | 0 | 仅供参考 |

### 漏洞详情

#### [漏洞编号] 漏洞名称

| 属性 | 值 |
|------|-----|
| 严重程度 | 🔴 Critical / 🟠 High / 🟡 Medium / 🔵 Low |
| CWE | CWE-XXX |
| 位置 | 第 X 行 |
| 置信度 | 高 / 中 / 低 |

**问题代码**:
\`\`\`
[问题代码片段]
\`\`\`

**问题描述**: [描述安全风险]

**修复建议**:
\`\`\`
[修复后的代码]
\`\`\`

---

### 安全最佳实践建议

1. **输入验证**: 对所有用户输入进行验证和清理
2. **输出编码**: 根据上下文正确编码输出
3. **参数化查询**: 使用参数化查询防止注入
4. **最小权限**: 遵循最小权限原则
5. **安全配置**: 使用安全的默认配置
6. **依赖管理**: 定期更新依赖，修复已知漏洞
7. **日志安全**: 不记录敏感信息
8. **错误处理**: 不向用户暴露内部错误详情

---

## 📤 输出格式要求

请严格按以下 JSON 格式输出扫描结果：

\`\`\`json
{
  "scan_summary": {
    "total_issues": 5,
    "critical": 1,
    "high": 2,
    "medium": 1,
    "low": 1
  },
  "findings": [
    {
      "severity": "critical|high|medium|low|info",
      "type": "漏洞类型（如 SQL Injection）",
      "cwe": "CWE-89",
      "location": { "file": "文件路径", "line": 42 },
      "vulnerable_code": "问题代码片段",
      "exploit_scenario": "攻击场景描述",
      "fix": "修复建议",
      "fix_example": "修复代码示例"
    }
  ],
  "recommendations": ["安全最佳实践建议1", "建议2"]
}
\`\`\`

## ⚠️ 边界约束

- ❌ 仅分析代码，不执行任何操作
- ❌ 不做法律/归因结论
- ❌ 不保证发现所有漏洞（静态分析有局限性）
- ✅ 输出结构化风险清单和修复建议

---

*指南版本: 1.0.0*
*工具: MCP Probe Kit - security_scan*
`;

import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { SecurityReport } from "../schemas/output/core-tools.js";

/**
 * security_scan 工具实现
 */
export async function securityScan(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      language?: string;
      scan_type?: string;
    }>(args, {
      defaultValues: {
        code: "",
        language: "auto",
        scan_type: "all",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "src", "代码", "content"],
        language: ["lang", "语言", "编程语言"],
        scan_type: ["type", "category", "类型", "扫描类型"],
      },
    });

    const code = getString(parsedArgs.code);
    const language = getString(parsedArgs.language) || "auto";
    const scanType = getString(parsedArgs.scan_type) || "all";

    if (!code) {
      throw new Error("缺少必填参数: code（需要扫描的代码）");
    }

    const scanTypeDesc: Record<string, string> = {
      all: "全面扫描（注入、认证、加密、敏感数据）",
      injection: "注入类漏洞（SQL注入、XSS、命令注入）",
      auth: "认证授权问题",
      crypto: "加密安全问题",
      sensitive_data: "敏感数据泄露",
    };

    const guide = PROMPT_TEMPLATE
      .replace(/{code}/g, code)
      .replace(/{language}/g, language)
      .replace(/{scan_type}/g, scanTypeDesc[scanType] || scanType);

    // 创建结构化数据对象
    const securityReport: SecurityReport = {
      summary: `安全扫描 - ${scanTypeDesc[scanType] || scanType}`,
      overallRisk: 'medium',
      vulnerabilities: [],
    };

    return okStructured(guide, securityReport, {
      schema: (await import('../schemas/output/core-tools.js')).SecurityReportSchema,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorData: SecurityReport = {
      summary: `安全扫描失败: ${errorMsg}`,
      overallRisk: 'none',
      vulnerabilities: [],
    };
    return okStructured(
      `❌ 安全扫描失败: ${errorMsg}`,
      errorData,
      {
        schema: (await import('../schemas/output/core-tools.js')).SecurityReportSchema,
      }
    );
  }
}
