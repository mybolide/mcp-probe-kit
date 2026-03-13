// MCP Probe Kit 工具数据
const toolsData = {
  workflow: [
    {
      name: 'start_feature',
      description: '完整的功能开发工作流编排：补齐图谱基线 → 刷新 GitNexus 图谱 → 收敛需求范围 → 生成规格 → 估算工作量',
      schema: 'FeatureReportSchema',
      params: [
        { name: 'description', type: 'string', required: false, desc: '功能详细描述' },
        { name: 'feature_name', type: 'string', required: false, desc: '功能名称（kebab-case格式）' },
        { name: 'docs_dir', type: 'string', required: false, desc: '文档输出目录，默认 docs' },
        { name: 'template_profile', type: 'string', required: false, desc: '模板档位：auto、guided 或 strict' },
        { name: 'requirements_mode', type: 'string', required: false, desc: '需求模式：steady 或 loop' },
        { name: 'loop_max_rounds', type: 'number', required: false, desc: '需求 loop 最大轮次（默认 2）' },
        { name: 'loop_question_budget', type: 'number', required: false, desc: '每轮最多提问数量（默认 5）' },
        { name: 'loop_assumption_cap', type: 'number', required: false, desc: '每轮假设上限（默认 3）' }
      ],
      usage: '用于启动完整的功能开发流程，自动补齐 graph-insights，并通过 GitNexus 的 query/context/impact 收敛需求范围后生成规格与估算',
      example: `// 使用示例
你: 请使用 start_feature 工具开发用户认证功能

description: "添加用户认证功能，支持邮箱登录"
feature_name: "user-auth"`
    },
    {
      name: 'start_bugfix',
      description: 'Bug 修复工作流编排：补齐图谱基线 → 刷新 GitNexus 图谱 → 收敛故障边界 → TBP 8 步真因分析 → 修复方案 → 生成测试',
      schema: 'BugFixReportSchema',
      params: [
        { name: 'error_message', type: 'string', required: true, desc: '错误信息' },
        { name: 'stack_trace', type: 'string', required: false, desc: '堆栈跟踪信息' },
        { name: 'code_context', type: 'string', required: false, desc: '相关代码上下文' },
        { name: 'analysis_mode', type: 'string', required: false, desc: '分析方法，默认 tbp8（先分析再修）' },
        { name: 'template_profile', type: 'string', required: false, desc: '模板档位：auto、guided 或 strict' },
        { name: 'requirements_mode', type: 'string', required: false, desc: '需求模式：steady 或 loop' },
        { name: 'loop_max_rounds', type: 'number', required: false, desc: '需求 loop 最大轮次（默认 2）' },
        { name: 'loop_question_budget', type: 'number', required: false, desc: '每轮最多提问数量（默认 5）' },
        { name: 'loop_assumption_cap', type: 'number', required: false, desc: '每轮假设上限（默认 3）' }
      ],
      usage: '适用于找问题、修 bug、排查异常、定位回归；会先补齐 graph-insights 并用 GitNexus 收敛边界，再按 TBP 8 步法闭合真因后修复',
      example: `// 使用示例
你: 请使用 start_bugfix 工具修复登录失败的问题

error_message: "TypeError: Cannot read property 'token' of undefined"
stack_trace: "at login.js:45:12"`
    },
    {
      name: 'start_onboard',
      description: '项目上手工作流：生成上下文文档，帮助新成员快速了解项目',
      schema: 'OnboardingReportSchema',
      params: [
        { name: 'project_path', type: 'string', required: false, desc: '项目路径，默认为当前目录' },
        { name: 'docs_dir', type: 'string', required: false, desc: '文档目录，默认为 docs' }
      ],
      usage: '帮助新成员快速了解项目结构、技术栈和开发规范',
      example: `// 使用示例
你: 请使用 start_onboard 工具帮我了解这个项目`
    },
    {
      name: 'start_ralph',
      description: 'Ralph Wiggum Loop 自动化开发，启动循环开发流程，默认启用多重安全保护',
      schema: 'RalphLoopReportSchema',
      params: [
        { name: 'goal', type: 'string', required: false, desc: '要完成的目标/需求描述' },
        { name: 'mode', type: 'string', required: false, desc: '运行模式：safe（安全模式，默认）、normal（普通模式）' },
        { name: 'max_iterations', type: 'number', required: false, desc: '最大迭代轮数，safe模式默认8' },
        { name: 'max_minutes', type: 'number', required: false, desc: '最大运行分钟数，safe模式默认25' }
      ],
      usage: '启动自动化循环开发，AI会持续迭代直到完成目标或达到安全限制',
      example: `// 使用示例
你: 请使用 start_ralph 工具实现用户认证功能

goal: "实现用户认证功能"
mode: "safe"`
    },
    {
      name: 'start_product',
      description: '产品设计完整工作流编排：PRD → 原型文档 → 设计系统 → HTML 原型 → 项目上下文更新',
      schema: 'WorkflowReportSchema',
      params: [
        { name: 'description', type: 'string', required: false, desc: '产品描述，详细描述产品目标、功能和用户需求' },
        { name: 'requirements_file', type: 'string', required: false, desc: '需求文档文件路径，如 "docs/requirements.md"' },
        { name: 'product_name', type: 'string', required: false, desc: '产品名称' },
        { name: 'product_type', type: 'string', required: false, desc: '产品类型，如 SaaS、E-commerce 等' },
        { name: 'skip_design_system', type: 'boolean', required: false, desc: '跳过设计系统生成，默认为 false' },
        { name: 'docs_dir', type: 'string', required: false, desc: '文档输出目录，默认为 docs' }
      ],
      usage: '一键完成从需求到 HTML 原型的全流程，生成可直接演示的产品原型',
      example: `// 使用示例
你: 请使用 start_product 工具完成产品设计

description: "在线教育平台，支持直播课程、录播课程"
product_name: "EduPro"
product_type: "SaaS"`
    },
    {
      name: 'start_ui',
      description: 'UI 开发统一入口：检查设计系统 → 生成组件目录 → 搜索/生成模板 → 渲染代码',
      schema: 'UIReportSchema',
      params: [
        { name: 'description', type: 'string', required: true, desc: 'UI需求描述（如"登录页面"、"用户列表"）' },
        { name: 'framework', type: 'string', required: false, desc: '目标框架：react、vue、html，默认react' },
        { name: 'template', type: 'string', required: false, desc: '模板名称，不提供则自动生成' },
        { name: 'template_profile', type: 'string', required: false, desc: '模板档位：auto、guided 或 strict' },
        { name: 'mode', type: 'string', required: false, desc: '执行模式：auto 或 manual（默认）' },
        { name: 'requirements_mode', type: 'string', required: false, desc: '需求模式：steady 或 loop' },
        { name: 'loop_max_rounds', type: 'number', required: false, desc: '需求 loop 最大轮次（默认 2）' },
        { name: 'loop_question_budget', type: 'number', required: false, desc: '每轮最多提问数量（默认 5）' },
        { name: 'loop_assumption_cap', type: 'number', required: false, desc: '每轮假设上限（默认 3）' }
      ],
      usage: '一键完成UI开发全流程，从设计系统到最终代码',
      example: `// 使用示例
你: 请使用 start_ui 工具创建一个登录页面

description: "登录页面"
framework: "react"`
    }
  ],
  analysis: [
    {
      name: 'code_review',
      description: '智能代码审查，从安全、性能、质量、风格和最佳实践等多维度分析代码',
      schema: 'CodeReviewReportSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要审查的代码，可以是代码片段、完整文件或 git diff 输出' },
        { name: 'focus', type: 'string', required: false, desc: '审查重点：security、performance、quality、all，默认 all' }
      ],
      usage: '全面审查代码质量，输出结构化问题清单（severity/category/suggestion）',
      example: `// 使用示例
你: 请使用 code_review 工具审查这段代码

code: "function login(user, pass) { 
  const query = 'SELECT * FROM users WHERE name=' + user;
  db.query(query);
}"
focus: "security"`
    },
    {
      name: 'code_insight',
      description: '代码图谱洞察工具，桥接 GitNexus 分析调用链、上下文和影响面（不可用时自动降级）',
      schema: 'CodeInsightSchema',
      params: [
        { name: 'mode', type: 'string', required: false, desc: '模式：auto（默认）、query、context、impact' },
        { name: 'query', type: 'string', required: false, desc: '查询文本（query 模式推荐）' },
        { name: 'target', type: 'string', required: false, desc: '目标符号（context/impact 模式推荐）' },
        { name: 'repo', type: 'string', required: false, desc: '仓库名称（多仓库场景可选）' },
        { name: 'direction', type: 'string', required: false, desc: 'impact 方向：upstream 或 downstream' },
        { name: 'max_depth', type: 'number', required: false, desc: 'impact 最大深度，默认 3' },
        { name: 'include_tests', type: 'boolean', required: false, desc: 'impact 是否包含测试文件，默认 false' }
      ],
      usage: '用于刷新 GitNexus 图谱、获取任务级调用链/上下文/影响面，并把结果保存到 docs/graph-insights 与 project-context 索引',
      example: `// 使用示例
你: 请使用 code_insight 工具分析登录相关调用链

mode: "query"
query: "authentication middleware"`
    },
    {
      name: 'fix_bug',
      description: '基于 TBP 8 步法的 Bug 真因分析与修复指导，输出证据链、修复计划、测试计划和预防措施',
      schema: 'BugAnalysisSchema',
      params: [
        { name: 'error_message', type: 'string', required: true, desc: '错误信息' },
        { name: 'stack_trace', type: 'string', required: false, desc: '堆栈跟踪' },
        { name: 'code_context', type: 'string', required: false, desc: '相关代码' },
        { name: 'analysis_mode', type: 'string', required: false, desc: '分析方法，默认 tbp8（先分析再修）' }
      ],
      usage: '适用于先找真因再修，帮助闭合现象、时间线、边界、真因和修复之间的因果链',
      example: `// 使用示例
你: 请使用 fix_bug 工具修复这个问题

error_message: "数据库连接超时"
code_context: "await db.connect({ timeout: 1000 })"`
    },
    {
      name: 'refactor',
      description: '重构建议工具，分析代码结构，提供重构步骤、风险评估和回滚计划',
      schema: 'RefactorPlanSchema',
      params: [
        { name: 'code', type: 'string', required: true, desc: '要重构的代码' },
        { name: 'goal', type: 'string', required: false, desc: '重构目标：improve_readability、reduce_complexity、performance' }
      ],
      usage: '分析代码结构，提供重构建议、重构步骤和风险评估',
      example: `// 使用示例
你: 请使用 refactor 工具重构这个函数

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
    }
  ],
  git: [
    {
      name: 'gencommit',
      description: '根据代码变更自动生成符合 Conventional Commits 规范的 Git commit 消息',
      schema: 'CommitGuidanceSchema',
      params: [
        { name: 'changes', type: 'string', required: false, desc: '代码变更内容，可以是 git diff 输出、变更描述或自然语言' },
        { name: 'type', type: 'string', required: false, desc: 'Commit 类型：feat、fix、docs、style、chore、refactor、test，会自动识别' }
      ],
      usage: '根据代码变更生成符合 Conventional Commits 规范的提交消息',
      example: `// 使用示例
你: 请使用 gencommit 工具生成提交消息

changes: "添加了用户登录功能，包含表单验证和错误处理"`
    },
    {
      name: 'git_work_report',
      description: '基于 Git diff 分析生成工作报告（日报/周期报），智能提取实际工作内容',
      schema: 'WorkReportSchema',
      params: [
        { name: 'date', type: 'string', required: false, desc: '单个日期，格式 YYYY-MM-DD（日报模式）' },
        { name: 'start_date', type: 'string', required: false, desc: '起始日期，格式 YYYY-MM-DD（周期报模式）' },
        { name: 'end_date', type: 'string', required: false, desc: '结束日期，格式 YYYY-MM-DD（周期报模式）' },
        { name: 'output_file', type: 'string', required: false, desc: '可选，输出文件路径' }
      ],
      usage: '自动读取指定日期的 Git 提交，分析 diff 内容，生成简洁专业的中文工作报告。如果直接命令失败，会提供创建临时脚本的方案（执行后自动删除）',
      example: `// 使用示例 - 生成日报
你: 请使用 git_work_report 工具生成 2026-02-03 的日报

date: "2026-02-03"

// 或生成周期报告
你: 请使用 git_work_report 工具生成 2026-02-01 至 2026-02-07 的周报

start_date: "2026-02-01"
end_date: "2026-02-07"`
    }
  ],
  generation: [
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
你: 请使用 gentest 工具生成测试

code: "function add(a, b) { return a + b; }"
framework: "jest"`
    }
  ],
  project: [
    {
      name: 'init_project',
      description: '按 Spec-Driven Development 方式生成需求/设计/任务文档',
      schema: 'ProjectInitSchema',
      params: [
        { name: 'input', type: 'string', required: false, desc: '项目需求描述，可以是简短描述或详细的功能需求文档' },
        { name: 'project_name', type: 'string', required: false, desc: '项目名称，默认为"新项目"' }
      ],
      usage: '按 Spec-Driven Development 方式生成需求/设计/任务文档',
      example: `// 使用示例
你: 请使用 init_project 工具初始化项目

input: "创建一个任务管理系统，支持任务创建、分配、跟踪"
project_name: "TaskManager"`
    },
    {
      name: 'init_project_context',
      description: '生成或维护项目上下文文档，并补齐 graph-insights 图谱基线入口',
      schema: 'ProjectContextSchema',
      params: [
        { name: 'docs_dir', type: 'string', required: false, desc: '文档目录，默认 docs' }
      ],
      usage: '新项目生成上下文骨架；老项目若已有 project-context.md，则保留旧文档，仅补 graph-insights 图谱文档与索引入口',
      example: `// 使用示例
你: 请使用 init_project_context 工具生成项目上下文`
    },
    {
      name: 'add_feature',
      description: '生成新功能规格文档（需求/设计/任务清单），基于项目上下文',
      schema: 'FeatureSpecSchema',
      params: [
        { name: 'description', type: 'string', required: true, desc: '功能详细描述' },
        { name: 'feature_name', type: 'string', required: false, desc: '功能名称（kebab-case 格式）' },
        { name: 'docs_dir', type: 'string', required: false, desc: '文档输出目录，默认为 docs' },
        { name: 'template_profile', type: 'string', required: false, desc: '模板档位：auto、guided 或 strict' }
      ],
      usage: '生成新功能规格文档（需求/设计/任务清单），基于项目上下文',
      example: `// 使用示例
你: 请使用 add_feature 工具添加新功能

description: "添加用户认证功能，支持邮箱登录和第三方登录"
feature_name: "user-auth"`
    },
    {
      name: 'estimate',
      description: '估算开发工作量，输出故事点、时间范围（乐观/正常/悲观）、风险点',
      schema: 'EstimateSchema',
      params: [
        { name: 'task_description', type: 'string', required: true, desc: '任务描述' },
        { name: 'code_context', type: 'string', required: false, desc: '相关代码或文件上下文' },
        { name: 'experience_level', type: 'string', required: false, desc: '经验水平：junior、mid、senior，默认为 mid' },
        { name: 'team_size', type: 'number', required: false, desc: '团队规模（人数），默认为 1' }
      ],
      usage: '估算开发工作量，输出故事点、时间范围（乐观/正常/悲观）、风险点',
      example: `// 使用示例
你: 请使用 estimate 工具估算工作量

task_description: "实现用户认证功能"
experience_level: "mid"
team_size: 2`
    },
    {
      name: 'interview',
      description: '需求访谈工具，通过结构化提问澄清需求，避免理解偏差和返工',
      schema: 'InterviewReportSchema',
      params: [
        { name: 'description', type: 'string', required: true, desc: '功能描述' },
        { name: 'feature_name', type: 'string', required: false, desc: '功能名称（kebab-case 格式）' },
        { name: 'answers', type: 'object', required: false, desc: '访谈问题的回答' }
      ],
      usage: '需求访谈工具，在开发前通过结构化提问澄清需求',
      example: `// 使用示例
你: 请使用 interview 工具进行需求访谈

description: "实现用户登录功能"`
    },
    {
      name: 'ask_user',
      description: 'AI 主动提问工具，支持单个或多个问题、提供选项、标注重要性',
      schema: 'UserQuestionSchema',
      params: [
        { name: 'question', type: 'string', required: false, desc: '单个问题' },
        { name: 'questions', type: 'array', required: false, desc: '多个问题列表' },
        { name: 'context', type: 'string', required: false, desc: '问题的背景信息或上下文' },
        { name: 'reason', type: 'string', required: false, desc: '为什么要问这个问题' }
      ],
      usage: 'AI 主动向用户提问，支持单个或多个问题、提供选项、标注重要性',
      example: `// 使用示例
AI: 请使用 ask_user 工具向用户提问

question: "你希望支持哪些支付方式？"
context: "正在设计支付模块"`
    }
  ],
  uiux: [
    {
      name: 'ui_design_system',
      description: '智能设计系统生成器，基于产品类型推理生成完整设计规范',
      schema: 'DesignSystemSchema',
      params: [
        { name: 'product_type', type: 'string', required: true, desc: '产品类型：SaaS, E-commerce, Healthcare, Fintech, Government 等' },
        { name: 'description', type: 'string', required: false, desc: '系统说明，详细描述产品功能、特点、使用场景' },
        { name: 'keywords', type: 'string', required: false, desc: '关键词，逗号分隔' },
        { name: 'target_audience', type: 'string', required: false, desc: '目标用户' },
        { name: 'stack', type: 'string', required: false, desc: '技术栈：react, vue, nextjs 等' }
      ],
      usage: '基于产品类型和需求，使用 AI 推理引擎生成完整的设计系统推荐',
      example: `// 使用示例
你: 请使用 ui_design_system 工具生成设计系统

product_type: "Government"
description: "政府类网站，需要权威、可信、易用的设计风格"`
    },
    {
      name: 'ui_search',
      description: '搜索 UI/UX 数据库，包括颜色、图标、图表、组件、设计模式等',
      schema: 'UISearchResultSchema',
      params: [
        { name: 'query', type: 'string', required: false, desc: '搜索关键词（支持中英文）' },
        { name: 'mode', type: 'string', required: false, desc: '搜索模式：search、catalog、template' },
        { name: 'category', type: 'string', required: false, desc: '数据类别：colors、icons、charts 等' },
        { name: 'stack', type: 'string', required: false, desc: '技术栈过滤' },
        { name: 'limit', type: 'number', required: false, desc: '返回结果数量，默认 10' },
        { name: 'min_score', type: 'number', required: false, desc: '最小相关性得分，默认 0' }
      ],
      usage: '搜索 UI/UX 数据库，使用 BM25 算法进行智能搜索',
      example: `// 使用示例
你: 请使用 ui_search 工具搜索按钮组件

query: "primary button"
mode: "search"
stack: "react"`
    },
    {
      name: 'sync_ui_data',
      description: '同步 UI/UX 数据到本地缓存，支持自动检查更新和强制同步',
      schema: 'SyncReportSchema',
      params: [
        { name: 'force', type: 'boolean', required: false, desc: '是否强制同步，默认 false' },
        { name: 'verbose', type: 'boolean', required: false, desc: '是否显示详细日志，默认 false' }
      ],
      usage: '同步 UI/UX 数据到本地缓存，从 npm 包 uipro-cli 下载最新数据',
      example: `// 使用示例
你: 请使用 sync_ui_data 工具同步数据

force: false
verbose: true`
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
      description: '智能代码审查、重构建议与代码图谱洞察'
    },
    git: {
      icon: '📝',
      title: 'Git 工具',
      description: 'Git 提交消息、变更日志、PR 描述和冲突解决'
    },
    generation: {
      icon: '⚡',
      title: '代码生成',
      description: '自动生成文档、测试、Mock 数据和开发辅助代码'
    },
    project: {
      icon: '📦',
      title: '项目管理',
      description: '项目初始化、功能规划、工作量估算和需求访谈'
    },
    uiux: {
      icon: '🎨',
      title: 'UI/UX 设计',
      description: '设计系统、组件目录、模板搜索与渲染'
    }
  }
};
