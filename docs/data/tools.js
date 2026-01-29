// MCP Probe Kit 工具数据
const toolsData = {
  workflow: [
    {
      name: 'start_feature',
      description: '完整的功能开发工作流编排：检查上下文 → 生成规格 → 估算工作量',
      schema: 'FeatureReportSchema',
      params: [
        { name: 'description', type: 'string', required: true, desc: '功能详细描述，可以是简短描述或详细需求说明' },
        { name: 'feature_name', type: 'string', required: false, desc: '功能名称（kebab-case格式），不提供会自动提取' },
        { name: 'docs_dir', type: 'string', required: false, desc: '文档输出目录，默认为 docs' }
      ],
      usage: '用于启动完整的功能开发流程，自动生成需求文档、设计方案和工作量估算',
      example: `// 使用示例
AI: 请使用 start_feature 工具开发用户认证功能

// 工具会自动：
// 1. 检查项目上下文
// 2. 生成功能规格文档
// 3. 估算开发工作量
// 4. 输出完整报告`
    },
    {
      name: 'start_bugfix',
      description: 'Bug 修复工作流编排：检查上下文 → 分析定位 → 修复方案 → 生成测试',
      schema: 'BugFixReportSchema',
      params: [
        { name: 'error_message', type: 'string', required: true, desc: '错误信息' },
        { name: 'stack_trace', type: 'string', required: false, desc: '堆栈跟踪信息' },
        { name: 'code_context', type: 'string', required: false, desc: '相关代码上下文' }
      ],
      usage: '用于系统化修复Bug，提供完整的分析、定位、修复和测试方案',
      example: `// 使用示例
AI: 请使用 start_bugfix 工具修复登录失败的问题

error_message: "TypeError: Cannot read property 'token' of undefined"
stack_trace: "at login.js:45:12"`
    },
    {
      name: 'start_onboard',
      description: '项目上手工作流：分析项目 → 生成上下文文档，帮助新成员快速了解项目',
      schema: 'OnboardingReportSchema',
      params: [
        { name: 'project_path', type: 'string', required: false, desc: '项目路径，默认为当前目录' },
        { name: 'docs_dir', type: 'string', required: false, desc: '文档目录，默认为 docs' }
      ],
      usage: '帮助新成员快速了解项目结构、技术栈和开发规范',
      example: `// 使用示例
AI: 请使用 start_onboard 工具帮我了解这个项目

// 工具会生成：
// - 项目结构分析
// - 技术栈说明
// - 开发规范文档`
    },
    {
      name: 'start_ui',
      description: 'UI 开发统一入口：检查设计系统 → 生成组件目录 → 搜索/生成模板 → 渲染代码',
      schema: 'UIReportSchema',
      params: [
        { name: 'description', type: 'string', required: true, desc: 'UI需求描述（如"登录页面"、"用户列表"）' },
        { name: 'framework', type: 'string', required: false, desc: '目标框架：react、vue、html，默认react' },
        { name: 'template', type: 'string', required: false, desc: '模板名称，不提供则自动生成' }
      ],
      usage: '一键完成UI开发全流程，从设计系统到最终代码',
      example: `// 使用示例
AI: 请使用 start_ui 工具创建一个登录页面

description: "登录页面"
framework: "react"`
    },
    {
      name: 'start_ralph',
      description: 'Ralph Wiggum Loop 自动化开发，启动循环开发流程，默认启用多重安全保护',
      schema: 'RalphLoopReportSchema',
      params: [
        { name: 'goal', type: 'string', required: true, desc: '要完成的目标/需求描述' },
        { name: 'mode', type: 'string', required: false, desc: '运行模式：safe（安全模式，默认）、normal（普通模式）' },
        { name: 'max_iterations', type: 'number', required: false, desc: '最大迭代轮数，safe模式默认8' },
        { name: 'max_minutes', type: 'number', required: false, desc: '最大运行分钟数，safe模式默认25' }
      ],
      usage: '启动自动化循环开发，AI会持续迭代直到完成目标或达到安全限制',
      example: `// 使用示例
AI: 请使用 start_ralph 工具实现用户认证功能

goal: "实现用户认证功能"
mode: "safe"  // 启用安全保护`
    },
    {
      name: 'start_review',
      description: '代码审查工作流：代码审查 + 安全扫描 + 性能分析',
      schema: 'ReviewWorkflowSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要审查的代码' },
        { name: 'language', type: 'string', required: false, desc: '编程语言，会自动识别' }
      ],
      usage: '全面审查代码质量、安全性和性能',
      example: `// 使用示例
AI: 请使用 start_review 工具审查这段代码

code: "function login(user) { ... }"`
    },
    {
      name: 'start_release',
      description: '发布工作流：生成 Changelog → 生成 PR 描述',
      schema: 'ReleaseWorkflowSchema',
      params: [
        { name: 'version', type: 'string', required: true, desc: '版本号（如 v1.2.0）' },
        { name: 'from_tag', type: 'string', required: false, desc: '起始tag，默认为上一个tag' }
      ],
      usage: '自动化版本发布流程，生成完整的发布文档',
      example: `// 使用示例
AI: 请使用 start_release 工具准备 v2.0.0 发布

version: "v2.0.0"`
    },
    {
      name: 'start_refactor',
      description: '重构工作流：审查现状 → 重构建议 → 生成测试',
      schema: 'RefactorWorkflowSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要重构的代码' },
        { name: 'goal', type: 'string', required: false, desc: '重构目标：improve_readability、reduce_complexity、performance' }
      ],
      usage: '系统化重构代码，包含分析、建议和测试',
      example: `// 使用示例
AI: 请使用 start_refactor 工具重构这个函数

code: "function processData() { ... }"
goal: "reduce_complexity"`
    },
    {
      name: 'start_api',
      description: 'API 开发工作流：生成文档 → 生成 Mock → 生成测试',
      schema: 'APIWorkflowSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: 'API代码' },
        { name: 'format', type: 'string', required: false, desc: '文档格式：markdown、openapi，默认openapi' },
        { name: 'language', type: 'string', required: false, desc: '编程语言，会自动识别' }
      ],
      usage: '完整的API开发流程，从文档到测试',
      example: `// 使用示例
AI: 请使用 start_api 工具为这个API生成完整文档

code: "app.post('/api/login', ...)"
format: "openapi"`
    },
    {
      name: 'start_doc',
      description: '文档工作流：生成注释 → 生成 README → 生成 API 文档',
      schema: 'DocWorkflowSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '代码或项目信息' },
        { name: 'project_info', type: 'string', required: false, desc: '项目信息' },
        { name: 'style', type: 'string', required: false, desc: '文档风格：jsdoc、tsdoc等，默认jsdoc' }
      ],
      usage: '一键生成完整项目文档',
      example: `// 使用示例
AI: 请使用 start_doc 工具为项目生成文档

code: "整个项目代码"`
    }
  ],
  analysis: [
    {
      name: 'code_review',
      description: '智能代码审查，从安全、性能、质量、风格和最佳实践等多维度分析代码',
      schema: 'CodeReviewReportSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要审查的代码，可以是代码片段、完整文件或 git diff 输出' },
        { name: 'focus', type: 'string', required: false, desc: '审查重点：security（安全）、performance（性能）、quality（质量）、all（全部），默认 all' }
      ],
      usage: '全面审查代码质量，输出结构化问题清单（severity/category/suggestion）',
      example: `// 使用示例
AI: 请使用 code_review 工具审查这段代码

code: "function login(user, pass) { 
  const query = 'SELECT * FROM users WHERE name=' + user;
  db.query(query);
}"
focus: "security"`
    },
    {
      name: 'debug',
      description: '调试分析工具，分析错误信息和堆栈跟踪，定位问题根因，提供调试策略',
      schema: 'DebugReportSchema',
      params: [
        { name: 'error', type: 'string', required: true, desc: '错误信息，可以是错误消息、堆栈跟踪或完整的错误输出' },
        { name: 'context', type: 'string', required: false, desc: '相关代码上下文，有助于更准确的分析' }
      ],
      usage: '分析错误信息和堆栈跟踪，定位问题根因，提供调试策略和解决方案',
      example: `// 使用示例
AI: 请使用 debug 工具分析这个错误

error: "TypeError: Cannot read property 'map' of undefined
  at UserList.render (UserList.js:23:15)"
context: "const users = await fetchUsers();"`
    },
    {
      name: 'fix_bug',
      description: 'Bug 修复指导，提供根因分析、修复计划、测试计划和预防措施',
      schema: 'BugAnalysisSchema',
      params: [
        { name: 'error_message', type: 'string', required: true, desc: '错误信息' },
        { name: 'stack_trace', type: 'string', required: false, desc: '堆栈跟踪' },
        { name: 'code_context', type: 'string', required: false, desc: '相关代码' }
      ],
      usage: '提供完整的 Bug 修复指导，包含根因分析、修复方案、测试计划和预防措施',
      example: `// 使用示例
AI: 请使用 fix_bug 工具修复这个问题

error_message: "数据库连接超时"
code_context: "await db.connect({ timeout: 1000 })"`
    },
    {
      name: 'refactor',
      description: '重构建议工具，分析代码结构，提供重构步骤、风险评估和回滚计划',
      schema: 'RefactorPlanSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要重构的代码' },
        { name: 'goal', type: 'string', required: false, desc: '重构目标：improve_readability（可读性）、reduce_complexity（复杂度）、performance（性能）' }
      ],
      usage: '分析代码结构，提供重构建议、重构步骤和风险评估',
      example: `// 使用示例
AI: 请使用 refactor 工具重构这个函数

code: "function process(data) {
  if (data) {
    if (data.length > 0) {
      for (let i = 0; i < data.length; i++) {
        // 复杂逻辑...
      }
    }
  }
}"
goal: "reduce_complexity"`
    },
    {
      name: 'security_scan',
      description: '安全扫描工具，检测注入、XSS、CSRF、认证、加密等安全漏洞',
      schema: 'SecurityReportSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要扫描的代码' },
        { name: 'language', type: 'string', required: false, desc: '编程语言，会自动识别' },
        { name: 'scan_type', type: 'string', required: false, desc: '扫描类型：injection（注入）、auth（认证）、crypto（加密）、all（全部），默认 all' }
      ],
      usage: '扫描安全漏洞，输出风险清单和修复建议',
      example: `// 使用示例
AI: 请使用 security_scan 工具扫描这段代码

code: "app.get('/user', (req, res) => {
  const id = req.query.id;
  db.query('SELECT * FROM users WHERE id=' + id);
})"
scan_type: "injection"`
    },
    {
      name: 'perf',
      description: '性能分析工具，识别算法、内存、数据库、网络等性能瓶颈，提供优化建议',
      schema: 'PerformanceReportSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要分析性能的代码' },
        { name: 'type', type: 'string', required: false, desc: '分析类型：algorithm（算法）、memory（内存）、database（数据库）、react（React渲染），会自动识别' }
      ],
      usage: '分析性能瓶颈，输出瓶颈清单和优化建议',
      example: `// 使用示例
AI: 请使用 perf 工具分析这段代码的性能

code: "function findUser(users, id) {
  for (let i = 0; i < users.length; i++) {
    if (users[i].id === id) return users[i];
  }
}"
type: "algorithm"`
    },
    {
      name: 'explain',
      description: '解释代码逻辑和实现原理，包含执行流程、关键概念',
      schema: 'CodeExplanationSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要解释的代码，可以是代码片段或完整函数' },
        { name: 'context', type: 'string', required: false, desc: '业务背景或上下文，有助于更好的解释' }
      ],
      usage: '解释代码逻辑和实现原理，包含执行流程、关键概念',
      example: `// 使用示例
AI: 请使用 explain 工具解释这段代码

code: "const memoized = useMemo(() => 
  expensiveCalculation(data), [data]);"
context: "React 性能优化"`
    }
  ],
  git: [
    {
      name: 'gencommit',
      description: '根据代码变更自动生成符合 Conventional Commits 规范的 Git commit 消息',
      schema: 'CommitMessageSchema',
      params: [
        { name: 'changes', type: 'string', required: false, desc: '代码变更内容，可以是 git diff 输出、变更描述或自然语言。如果不提供，工具会提示执行 git diff' },
        { name: 'type', type: 'string', required: false, desc: 'Commit 类型：feat（新功能）、fix（修复）、docs（文档）、style（样式）、chore（杂项）、refactor（重构）、test（测试），会自动识别' }
      ],
      usage: '根据代码变更生成符合 Conventional Commits 规范的提交消息',
      example: `// 使用示例
AI: 请使用 gencommit 工具生成提交消息

changes: "添加了用户登录功能，包含表单验证和错误处理"

// 输出示例：
// feat: 添加用户登录功能
// 
// - 实现登录表单和验证逻辑
// - 添加错误处理和提示
// - 集成 JWT 认证`
    },
    {
      name: 'genchangelog',
      description: '根据 commit 历史生成 CHANGELOG，按 feat/fix/breaking 分类',
      schema: 'ChangelogSchema',
      params: [
        { name: 'version', type: 'string', required: false, desc: '版本号（如 v1.2.0），如果不提供会提示用户输入' },
        { name: 'from', type: 'string', required: false, desc: '起始 tag 或 commit，默认为上一个 tag' },
        { name: 'to', type: 'string', required: false, desc: '结束 tag 或 commit，默认为 HEAD' }
      ],
      usage: '根据 commit 历史生成 CHANGELOG，按功能、修复、破坏性变更分类',
      example: `// 使用示例
AI: 请使用 genchangelog 工具生成 v2.0.0 的更新日志

version: "v2.0.0"
from: "v1.9.0"

// 输出示例：
// ## [2.0.0] - 2026-01-27
// 
// ### ✨ Features
// - 添加用户认证功能
// - 支持多语言切换
// 
// ### 🐛 Bug Fixes
// - 修复登录页面样式问题`
    },
    {
      name: 'genpr',
      description: '生成 Pull Request 描述，包含变更摘要、影响范围、测试说明',
      schema: 'PullRequestSchema',
      params: [
        { name: 'branch', type: 'string', required: false, desc: '分支名称，默认为当前分支' },
        { name: 'commits', type: 'string', required: false, desc: 'Commit 历史，会自动获取 git log' }
      ],
      usage: '分析 commit 历史，生成包含变更摘要、影响范围、测试说明的 PR 描述',
      example: `// 使用示例
AI: 请使用 genpr 工具为当前分支生成 PR 描述

// 输出示例：
// ## 📝 变更摘要
// 实现用户认证功能
// 
// ## 🎯 影响范围
// - 新增登录/注册页面
// - 修改路由配置
// 
// ## ✅ 测试说明
// - 单元测试已通过
// - 手动测试登录流程`
    },
    {
      name: 'resolve_conflict',
      description: '分析 Git 合并冲突，理解双方意图，提供解决方案',
      schema: 'ConflictResolutionSchema',
      params: [
        { name: 'conflicts', type: 'string', required: true, desc: 'Git 冲突内容，包含 <<<<<<< ======= >>>>>>> 标记的文件内容' }
      ],
      usage: '分析 Git 合并冲突，理解双方意图，提供解决方案',
      example: `// 使用示例
AI: 请使用 resolve_conflict 工具解决这个冲突

conflicts: "
<<<<<<< HEAD
const API_URL = 'https://api.prod.com';
=======
const API_URL = 'https://api.dev.com';
>>>>>>> feature-branch
"

// 工具会分析双方意图并提供解决建议`
    }
  ],
  generation: [
    {
      name: 'gendoc',
      description: '生成代码注释文档，支持 JSDoc/TSDoc/Javadoc 等格式',
      schema: 'DocumentationSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要生成注释的代码' },
        { name: 'style', type: 'string', required: false, desc: '注释风格：jsdoc、tsdoc、javadoc，会根据语言自动选择' },
        { name: 'lang', type: 'string', required: false, desc: '注释语言：zh（中文）、en（英文），默认 zh' }
      ],
      usage: '生成代码注释（JSDoc/TSDoc/Javadoc），补全参数/返回值/异常/示例',
      example: `// 使用示例
AI: 请使用 gendoc 工具为这个函数生成注释

code: "function calculateTotal(items, discount) {
  return items.reduce((sum, item) => sum + item.price, 0) * (1 - discount);
}"
style: "jsdoc"
lang: "zh"`
    },
    {
      name: 'genapi',
      description: '生成 API 文档，支持 Markdown/OpenAPI/Swagger 格式',
      schema: 'APIDocumentationSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: 'API 代码，可以是路由定义、Controller 或接口函数' },
        { name: 'format', type: 'string', required: false, desc: '文档格式：markdown、openapi、jsdoc，默认 markdown' }
      ],
      usage: '基于 API 代码生成文档，包含参数说明与示例',
      example: `// 使用示例
AI: 请使用 genapi 工具生成 API 文档

code: "app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  // ...
})"
format: "openapi"`
    },
    {
      name: 'gensql',
      description: '根据自然语言生成 SQL 查询，支持 PostgreSQL/MySQL/SQLite',
      schema: 'SQLQuerySchema',
      params: [
        { name: 'description', type: 'string', required: true, desc: '查询需求的自然语言描述，如"查询所有活跃用户的姓名和邮箱"' },
        { name: 'dialect', type: 'string', required: false, desc: 'SQL 方言：postgres、mysql、sqlite，默认 postgres' }
      ],
      usage: '将自然语言描述转换为 SQL 语句',
      example: `// 使用示例
AI: 请使用 gensql 工具生成查询语句

description: "查询最近30天注册的用户，按注册时间倒序排列"
dialect: "postgres"

// 输出示例：
// SELECT * FROM users 
// WHERE created_at >= NOW() - INTERVAL '30 days'
// ORDER BY created_at DESC;`
    },
    {
      name: 'genreadme',
      description: '生成项目 README 文档，包含安装、使用、API、示例等章节',
      schema: 'ReadmeSchema',
      params: [
        { name: 'project_info', type: 'string', required: true, desc: '项目信息，可以是项目描述、代码或 package.json 内容' },
        { name: 'style', type: 'string', required: false, desc: '文档风格：simple（简洁）、detailed（详细），默认 detailed' }
      ],
      usage: '生成 README 文档，包含项目介绍/安装/使用/脚本/FAQ',
      example: `// 使用示例
AI: 请使用 genreadme 工具生成项目文档

project_info: "一个基于 React 的任务管理应用"
style: "detailed"`
    },
    {
      name: 'gen_mock',
      description: '生成 Mock 测试数据，支持 JSON/TypeScript/JavaScript/CSV 格式',
      schema: 'MockDataSchema',
      params: [
        { name: 'schema', type: 'string', required: true, desc: '数据结构定义（TypeScript interface、JSON Schema 或自然语言描述）' },
        { name: 'count', type: 'number', required: false, desc: '生成数据条数，默认为 1，范围 1-1000' },
        { name: 'format', type: 'string', required: false, desc: '输出格式：json、typescript、javascript、csv，默认为 json' },
        { name: 'locale', type: 'string', required: false, desc: '数据语言：zh-CN（中文）、en-US（英文）、ja-JP（日文），默认为 zh-CN' }
      ],
      usage: '根据 TypeScript 类型或 JSON Schema 生成 Mock 数据',
      example: `// 使用示例
AI: 请使用 gen_mock 工具生成测试数据

schema: "interface User { 
  id: number; 
  name: string; 
  email: string; 
}"
count: 10
format: "json"
locale: "zh-CN"`
    },
    {
      name: 'gentest',
      description: '生成单元测试，支持 Jest/Vitest/Mocha 等框架，包含边界用例和 mock 数据',
      schema: 'TestSuiteSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要生成测试的代码，可以是函数、类或模块' },
        { name: 'framework', type: 'string', required: false, desc: '测试框架：jest、vitest、mocha，会自动识别项目使用的框架' }
      ],
      usage: '生成单元测试代码，包含边界用例和 mock',
      example: `// 使用示例
AI: 请使用 gentest 工具生成测试

code: "function add(a, b) { return a + b; }"
framework: "jest"`
    },
    {
      name: 'genui',
      description: '根据描述生成 UI 组件代码（React/Vue/HTML），包含 Props 和样式',
      schema: 'UIComponentSchema',
      params: [
        { name: 'description', type: 'string', required: true, desc: '组件描述，可以是简短描述（如"登录表单组件"）或详细的UI需求' },
        { name: 'framework', type: 'string', required: false, desc: '前端框架：react、vue、html，默认 react' }
      ],
      usage: '根据描述生成 UI 组件代码，包含 Props 和样式',
      example: `// 使用示例
AI: 请使用 genui 工具生成一个按钮组件

description: "主按钮组件，支持 primary/secondary 两种样式"
framework: "react"`
    }
  ],
  project: [
    {
      name: 'init_project',
      description: '按 Spec-Driven Development 方式生成需求/设计/任务文档',
      schema: 'ProjectInitSchema',
      params: [
        { name: 'input', type: 'string', required: false, desc: '项目需求描述，可以是简短描述（如"创建电商网站"）或详细的功能需求文档' },
        { name: 'project_name', type: 'string', required: false, desc: '项目名称，默认为"新项目"' }
      ],
      usage: '按 Spec-Driven Development 方式生成需求/设计/任务文档',
      example: `// 使用示例
AI: 请使用 init_project 工具初始化项目

input: "创建一个任务管理系统，支持任务创建、分配、跟踪"
project_name: "TaskManager"`
    },
    {
      name: 'init_project_context',
      description: '生成项目上下文文档（技术栈/架构/编码规范），支持单文件和模块化两种模式',
      schema: 'ProjectContextSchema',
      params: [
        { name: 'mode', type: 'string', required: false, desc: '生成模式：single（单文件，默认）或 modular（模块化，生成 6 个分类文档）' },
        { name: 'docs_dir', type: 'string', required: false, desc: '文档目录，默认 docs' }
      ],
      usage: '生成项目上下文文档。单文件模式生成一个完整的 project-context.md；模块化模式生成 1 个索引文件 + 5 个分类文档（适合大型项目）',
      example: `// 单文件模式（默认）
AI: 请使用 init_project_context 工具生成项目上下文
// 生成：docs/project-context.md

// 模块化模式
AI: 请使用 init_project_context 工具生成项目上下文
mode: "modular"
// 生成：
// - docs/project-context.md（索引）
// - docs/project-context/tech-stack.md
// - docs/project-context/architecture.md
// - docs/project-context/coding-standards.md
// - docs/project-context/dependencies.md
// - docs/project-context/workflows.md`
    },
    {
      name: 'add_feature',
      description: '生成新功能规格文档（需求/设计/任务清单），基于项目上下文',
      schema: 'FeatureSpecSchema',
      params: [
        { name: 'description', type: 'string', required: true, desc: '功能详细描述，可以是简短的自然语言（如"添加用户认证功能"）或详细的需求说明' },
        { name: 'feature_name', type: 'string', required: false, desc: '功能名称（kebab-case 格式，如 user-auth），如果不提供会从 description 自动提取' },
        { name: 'docs_dir', type: 'string', required: false, desc: '文档输出目录，默认为 docs' }
      ],
      usage: '生成新功能规格文档（需求/设计/任务清单），基于项目上下文',
      example: `// 使用示例
AI: 请使用 add_feature 工具添加新功能

description: "添加用户认证功能，支持邮箱登录和第三方登录"
feature_name: "user-auth"`
    },
    {
      name: 'estimate',
      description: '估算开发工作量，输出故事点、时间范围（乐观/正常/悲观）、风险点',
      schema: 'EstimationSchema',
      params: [
        { name: 'task_description', type: 'string', required: true, desc: '任务描述，可以是简短的自然语言或详细的任务说明' },
        { name: 'code_context', type: 'string', required: false, desc: '相关代码或文件上下文，有助于更准确的估算' },
        { name: 'experience_level', type: 'string', required: false, desc: '经验水平：junior（初级）、mid（中级）、senior（高级），默认为 mid' },
        { name: 'team_size', type: 'number', required: false, desc: '团队规模（人数），默认为 1' }
      ],
      usage: '估算开发工作量，输出故事点、时间范围（乐观/正常/悲观）、风险点',
      example: `// 使用示例
AI: 请使用 estimate 工具估算工作量

task_description: "实现用户认证功能"
experience_level: "mid"
team_size: 2`
    },
    {
      name: 'analyze_project',
      description: '分析项目结构、技术栈、架构模式，输出项目全景报告',
      schema: 'ProjectAnalysisSchema',
      params: [
        { name: 'project_path', type: 'string', required: false, desc: '项目路径，默认为当前目录' },
        { name: 'max_depth', type: 'number', required: false, desc: '分析深度，默认 5' }
      ],
      usage: '分析项目结构、技术栈、架构模式，输出项目全景报告',
      example: `// 使用示例
AI: 请使用 analyze_project 工具分析项目

// 工具会输出：
// - 项目结构分析
// - 技术栈识别
// - 架构模式分析
// - 依赖关系图`
    },
    {
      name: 'interview',
      description: '需求访谈工具，通过结构化提问澄清需求，避免理解偏差和返工',
      schema: 'InterviewReportSchema',
      params: [
        { name: 'description', type: 'string', required: true, desc: '功能描述（如"实现用户登录功能"），用于开始访谈' },
        { name: 'feature_name', type: 'string', required: false, desc: '功能名称（kebab-case 格式，如 user-login），会自动从描述中提取' },
        { name: 'answers', type: 'object', required: false, desc: '访谈问题的回答（JSON 对象，key 为问题 ID，value 为回答内容），用于提交访谈结果' }
      ],
      usage: '需求访谈工具，在开发前通过结构化提问澄清需求，避免理解偏差和返工；生成访谈记录文件供后续 start_feature/add_feature 使用；仅支持 feature 类型',
      example: `// 使用示例
AI: 请使用 interview 工具进行需求访谈

description: "实现用户登录功能"

// 工具会提出结构化问题，如：
// 1. 支持哪些登录方式？
// 2. 是否需要记住登录状态？
// 3. 密码规则是什么？`
    },
    {
      name: 'ask_user',
      description: 'AI 主动提问工具，支持单个或多个问题、提供选项、标注重要性',
      schema: 'UserQuestionSchema',
      params: [
        { name: 'question', type: 'string', required: false, desc: '单个问题（如"你希望支持哪些支付方式？"）' },
        { name: 'questions', type: 'array', required: false, desc: '多个问题列表，每个问题可包含 question、context、options、required 字段' },
        { name: 'context', type: 'string', required: false, desc: '问题的背景信息或上下文' },
        { name: 'reason', type: 'string', required: false, desc: '为什么要问这个问题（提问原因）' }
      ],
      usage: 'AI 主动向用户提问，支持单个或多个问题、提供选项、标注重要性；可在任何时候使用',
      example: `// 使用示例
AI: 请使用 ask_user 工具向用户提问

question: "你希望支持哪些支付方式？"
context: "正在设计支付模块"
reason: "需要确定支付集成方案"`
    }
  ],
  uiux: [
    {
      name: 'ui_design_system',
      description: '智能设计系统生成器，基于产品类型推理生成完整设计规范',
      schema: 'DesignSystemSchema',
      params: [
        { name: 'product_type', type: 'string', required: true, desc: '产品类型：SaaS, E-commerce, Healthcare, Fintech, Government（政府）, Education（教育）, Portfolio, Agency 等' },
        { name: 'description', type: 'string', required: false, desc: '系统说明（推荐），详细描述产品功能、特点、使用场景' },
        { name: 'keywords', type: 'string', required: false, desc: '关键词，逗号分隔，如 "professional, modern, trustworthy"' },
        { name: 'target_audience', type: 'string', required: false, desc: '目标用户，如 "B2B企业"、"C端消费者"、"政府公务员"' },
        { name: 'stack', type: 'string', required: false, desc: '技术栈：react, vue, nextjs, nuxtjs, tailwind, html, svelte, astro 等' }
      ],
      usage: '基于产品类型和需求，使用 AI 推理引擎生成完整的设计系统推荐，包括 UI 风格、配色方案、字体配对、落地页模式、效果建议、反模式警告和交付检查清单',
      example: `// 使用示例
AI: 请使用 ui_design_system 工具生成设计系统

product_type: "Government"
description: "政府类网站，需要权威、可信、易用的设计风格"
keywords: "professional, trustworthy, authoritative"
target_audience: "普通市民"
stack: "react"`
    },
    {
      name: 'init_component_catalog',
      description: '初始化组件目录，定义可用 UI 组件及其属性，确保样式统一',
      schema: 'ComponentCatalogSchema',
      params: [],
      usage: '基于设计系统规范（design-system.json）生成组件目录文件，定义可用的 UI 组件及其属性，组件定义包含占位符，渲染时自动替换为设计规范中的实际值，确保样式统一',
      example: `// 使用示例
AI: 请使用 init_component_catalog 工具初始化组件目录

// 工具会读取 design-system.json 并生成 component-catalog.json
// 包含按钮、输入框、卡片等组件定义`
    },
    {
      name: 'ui_search',
      description: '搜索 UI/UX 数据库，包括颜色、图标、图表、组件、设计模式等',
      schema: 'UISearchResultSchema',
      params: [
        { name: 'query', type: 'string', required: false, desc: '搜索关键词（支持中英文，如 "button"、"按钮"、"primary color"、"主色调"），catalog 模式不需要此参数' },
        { name: 'mode', type: 'string', required: false, desc: '搜索模式：search（搜索 UI/UX 数据，默认）、catalog（查看组件目录）、template（搜索 UI 模板）' },
        { name: 'category', type: 'string', required: false, desc: '数据类别（仅 search 模式）：colors（颜色）、icons（图标）、charts（图表）、landing（落地页）、products（产品）、typography（字体）、styles（样式）、ux-guidelines（UX 指南）、web-interface（Web 界面）等' },
        { name: 'stack', type: 'string', required: false, desc: '技术栈过滤（仅 search 模式）：react、vue、nextjs、nuxtjs、svelte、astro、flutter、react-native、swiftui、jetpack-compose 等' },
        { name: 'limit', type: 'number', required: false, desc: '返回结果数量，默认 10，范围 1-50' },
        { name: 'min_score', type: 'number', required: false, desc: '最小相关性得分，默认 0，范围 0-100' }
      ],
      usage: '搜索 UI/UX 数据库，包括颜色、图标、图表、组件、设计模式等。支持三种模式：search（搜索数据）、catalog（查看组件目录）、template（搜索 UI 模板）。使用 BM25 算法进行智能搜索，支持按类别和技术栈过滤',
      example: `// 使用示例
AI: 请使用 ui_search 工具搜索按钮组件

query: "primary button"
mode: "search"
category: "web-interface"
stack: "react"
limit: 5`
    },
    {
      name: 'sync_ui_data',
      description: '同步 UI/UX 数据到本地缓存，支持自动检查更新和强制同步',
      schema: 'SyncResultSchema',
      params: [
        { name: 'force', type: 'boolean', required: false, desc: '是否强制同步（忽略版本检查），默认 false' },
        { name: 'verbose', type: 'boolean', required: false, desc: '是否显示详细日志，默认 false' }
      ],
      usage: '同步 UI/UX 数据到本地缓存，从 npm 包 uipro-cli 下载最新数据，支持自动检查更新和强制同步。数据存储在 ~/.mcp-probe-kit/ui-ux-data/',
      example: `// 使用示例
AI: 请使用 sync_ui_data 工具同步数据

force: false
verbose: true`
    },
    {
      name: 'render_ui',
      description: 'UI 渲染引擎，将 JSON 模板渲染为最终代码，自动替换占位符',
      schema: 'UIRenderResultSchema',
      params: [
        { name: 'template', type: 'string', required: true, desc: '模板文件路径（JSON 格式，如 docs/ui/login-form.json）' },
        { name: 'framework', type: 'string', required: false, desc: '目标框架：react、vue、html，默认 react' }
      ],
      usage: 'UI 渲染引擎，将 JSON 模板渲染为最终代码。自动读取设计规范（design-system.json）和组件目录（component-catalog.json），替换占位符，生成完整的 React/Vue/HTML 代码，确保所有组件样式统一',
      example: `// 使用示例
AI: 请使用 render_ui 工具渲染登录表单

template: "docs/ui/login-form.json"
framework: "react"`
    },
    {
      name: 'design2code',
      description: '将设计稿转换为前端代码，1:1 还原布局和样式',
      schema: 'Design2CodeSchema',
      params: [
        { name: 'input', type: 'string', required: true, desc: '设计稿输入：图片 URL、base64 图片、HTML 代码或设计稿描述' },
        { name: 'framework', type: 'string', required: false, desc: '目标框架：vue、react，默认为 vue' },
        { name: 'style_solution', type: 'string', required: false, desc: '样式方案：tailwind、css-modules、styled-components，默认为 tailwind' },
        { name: 'component_type', type: 'string', required: false, desc: '组件类型：page（页面组件）、component（通用组件），默认为 page' }
      ],
      usage: '将设计稿（图片URL/base64/HTML）转换为前端代码（React/Vue），1:1 还原布局和样式',
      example: `// 使用示例
AI: 请使用 design2code 工具转换设计稿

input: "https://example.com/design.png"
framework: "react"
style_solution: "tailwind"
component_type: "page"`
    }
  ],
  other: [
    {
      name: 'fix',
      description: '自动修复代码问题（Lint/格式化/类型错误），输出补丁',
      schema: 'CodeFixSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要修复的代码' },
        { name: 'type', type: 'string', required: false, desc: '修复类型：lint（代码规范）、ts（TypeScript错误）、format（格式化）、import（导入），会自动识别' }
      ],
      usage: '自动修复可机械化问题，输出补丁（unified diff）',
      example: `// 使用示例
AI: 请使用 fix 工具修复这段代码

code: "const x=1;if(x==1){console.log('test')}"
type: "format"`
    },
    {
      name: 'convert',
      description: '转换代码格式或框架（JS→TS/Class→Hooks/Vue2→Vue3），保持逻辑不变',
      schema: 'CodeConversionSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要转换的代码' },
        { name: 'from', type: 'string', required: false, desc: '源格式：js、class、vue2，会自动识别' },
        { name: 'to', type: 'string', required: false, desc: '目标格式：ts、hooks、vue3，会自动识别' }
      ],
      usage: '转换代码格式或框架，保持逻辑不变',
      example: `// 使用示例
AI: 请使用 convert 工具将这段代码转换为 TypeScript

code: "function add(a, b) { return a + b; }"
from: "js"
to: "ts"`
    },
    {
      name: 'split',
      description: '将大文件拆分为小模块，按类型/功能/组件策略拆分',
      schema: 'FileSplitSchema',
      params: [
        { name: 'file', type: 'string', required: true, desc: '要拆分的文件内容' },
        { name: 'strategy', type: 'string', required: false, desc: '拆分策略：auto（自动）、by-type（按类型）、by-function（按功能），默认 auto' }
      ],
      usage: '将大文件拆分为小模块，按类型/功能/组件策略拆分',
      example: `// 使用示例
AI: 请使用 split 工具拆分这个大文件

file: "// 1000+ 行的代码..."
strategy: "by-function"`
    },
    {
      name: 'css_order',
      description: '重排 CSS 属性顺序，按布局→盒模型→视觉→其他规则整理',
      schema: 'CSSOrderSchema',
      params: [
        { name: 'css', type: 'string', required: false, desc: 'CSS 代码，如果不提供会处理当前文件' }
      ],
      usage: '重排 CSS 属性顺序，按布局→盒模型→视觉→其他规则整理',
      example: `// 使用示例
AI: 请使用 css_order 工具整理 CSS

css: ".button { 
  color: blue; 
  display: flex; 
  padding: 10px; 
}"`
    },
    {
      name: 'check_deps',
      description: '检查依赖健康度，查找过期依赖、安全漏洞、体积问题',
      schema: 'DependencyCheckSchema',
      params: [],
      usage: '检查依赖版本、安全漏洞、体积，输出升级建议',
      example: `// 使用示例
AI: 请使用 check_deps 工具检查项目依赖

// 工具会检查：
// - 过期的依赖包
// - 安全漏洞
// - 包体积问题
// - 升级建议`
    },
    {
      name: 'init_setting',
      description: '写入推荐的 AI 配置到 .cursor/settings.json',
      schema: 'SettingInitSchema',
      params: [
        { name: 'project_path', type: 'string', required: false, desc: '项目路径，默认为当前工作区路径' }
      ],
      usage: '写入推荐的 AI 配置到 .cursor/settings.json',
      example: `// 使用示例
AI: 请使用 init_setting 工具初始化 Cursor 配置

// 工具会创建 .cursor/settings.json 并写入推荐配置`
    },
    {
      name: 'gen_skill',
      description: '为 MCP Probe Kit 工具生成符合开放标准的技能文档',
      schema: 'SkillDocSchema',
      params: [
        { name: 'tool_name', type: 'string', required: false, desc: '工具名称，当 scope 为 single 时必填' },
        { name: 'scope', type: 'string', required: false, desc: '生成范围：all（所有工具）、single（单个工具），默认 all' },
        { name: 'lang', type: 'string', required: false, desc: '文档语言：zh（中文）、en（英文），默认 zh' }
      ],
      usage: '为 MCP Probe Kit 工具生成符合开放标准的技能文档，输出到 skills/ 目录',
      example: `// 使用示例
AI: 请使用 gen_skill 工具生成技能文档

scope: "all"
lang: "zh"`
    }
  ],
  
  // 产品设计工作流工具
  productDesign: [
    {
      name: 'gen_prd',
      description: '生成产品需求文档（PRD），包含产品概述、功能需求、优先级、非功能性需求和页面清单',
      schema: 'GenPrdSchema',
      params: [
        { name: 'description', type: 'string', required: true, desc: '产品描述或访谈记录' },
        { name: 'product_name', type: 'string', required: false, desc: '产品名称，默认为"新产品"' },
        { name: 'docs_dir', type: 'string', required: false, desc: '文档输出目录，默认为 docs' }
      ],
      usage: '基于产品描述生成标准的 PRD 文档，为产品设计提供基础',
      example: `// 使用示例
AI: 请使用 gen_prd 工具生成产品需求文档

description: "在线教育平台，支持直播课程、录播课程、作业提交和成绩管理"
product_name: "EduPro"`
    },
    {
      name: 'gen_prototype',
      description: '生成原型设计文档，为每个页面生成独立的 Markdown 文档，包含页面结构、交互说明和元素清单',
      schema: 'GenPrototypeSchema',
      params: [
        { name: 'prd_path', type: 'string', required: false, desc: 'PRD 文档路径，如果提供将从 PRD 中提取页面清单' },
        { name: 'description', type: 'string', required: false, desc: '功能描述，如果没有 PRD 可直接提供' },
        { name: 'docs_dir', type: 'string', required: false, desc: '文档输出目录，默认为 docs' }
      ],
      usage: '基于 PRD 或功能描述生成原型设计文档，为 UI 开发提供指导',
      example: `// 使用示例
AI: 请使用 gen_prototype 工具生成原型设计文档

prd_path: "docs/prd/product-requirements.md"`
    },
    {
      name: 'start_product',
      description: '产品设计完整工作流编排：PRD → 原型文档 → 设计系统 → HTML 原型 → 项目上下文更新。生成的 HTML 原型可直接在浏览器中查看',
      schema: 'StartProductSchema',
      params: [
        { name: 'description', type: 'string', required: false, desc: '产品描述，详细描述产品目标、功能和用户需求。如果提供了 requirements_file，此参数可选' },
        { name: 'requirements_file', type: 'string', required: false, desc: '需求文档文件路径，如 "docs/requirements.md"。工具会读取完整文件内容作为需求' },
        { name: 'product_name', type: 'string', required: false, desc: '产品名称' },
        { name: 'product_type', type: 'string', required: false, desc: '产品类型，如 SaaS、E-commerce 等，用于生成设计系统' },
        { name: 'skip_design_system', type: 'boolean', required: false, desc: '跳过设计系统生成，默认为 false' },
        { name: 'docs_dir', type: 'string', required: false, desc: '文档输出目录，默认为 docs' }
      ],
      usage: '一键完成从需求到 HTML 原型的全流程，生成可直接演示的产品原型。支持从文件读取完整需求文档',
      example: `// 使用示例 1：直接提供描述
AI: 请使用 start_product 工具完成产品设计

description: "在线教育平台，支持直播课程、录播课程、作业提交和成绩管理"
product_name: "EduPro"
product_type: "SaaS"

// 使用示例 2：从文件读取需求（推荐用于长文档）
AI: 请使用 start_product 工具完成产品设计

requirements_file: "docs/requirements.md"
product_name: "EduPro"
product_type: "SaaS"

// 工具会自动：
// 1. 读取完整需求文档（如果提供了 requirements_file）
// 2. 生成 PRD 文档
// 3. 生成原型设计文档
// 4. 生成设计系统
// 5. 生成 HTML 可交互原型
// 6. 更新项目上下文`
    }
  ],

  // 工具分类元数据
  categories: {
    workflow: {
      icon: '🔄',
      title: '工作流编排',
      description: '完整的开发工作流自动化，从需求到发布的全流程支持'
    },
    analysis: {
      icon: '🔍',
      title: '代码分析',
      description: '智能代码审查、调试、性能分析和安全扫描'
    },
    git: {
      icon: '📝',
      title: 'Git 工具',
      description: 'Git 提交消息、变更日志、PR 描述和冲突解决'
    },
    generation: {
      icon: '⚡',
      title: '代码生成',
      description: '自动生成文档、测试、Mock 数据和 UI 组件'
    },
    project: {
      icon: '📦',
      title: '项目管理',
      description: '项目初始化、功能规划、工作量估算和需求访谈'
    },
    uiux: {
      icon: '🎨',
      title: 'UI/UX 设计',
      description: '设计系统、组件库、原型设计和设计稿转代码'
    },
    productDesign: {
      icon: '🚀',
      title: '产品设计',
      description: '从需求到原型的完整产品设计工作流'
    },
    other: {
      icon: '🛠️',
      title: '其他工具',
      description: '代码修复、格式转换、依赖检查等实用工具'
    }
  }
};
