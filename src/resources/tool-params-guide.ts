/**
 * 工具参数指南 Resource
 * 为 AI 提供详细的参数说明和使用示例
 */

export function getToolParamsGuide(version: string) {
  return {
    guide: "MCP Probe Kit 工具参数指南",
    version,
    important_notes: [
      "所有工具的参数都是可选的（required: []）",
      "AI 应该根据用户意图智能选择传递哪些参数",
      "参数的值可以是自然语言描述，工具会智能提取",
      "不要使用嵌套的 input 字段，直接传递参数",
      "优先使用自然语言描述，工具会自动解析",
    ],
    best_practices: {
      "1. 直接传参": "不要使用 {input: {...}}，直接传 {description: '...'}",
      "2. 自然语言": "参数值可以是自然语言，工具会智能处理",
      "3. 最小化": "只传必要的参数，其他使用默认值",
      "4. 描述优先": "对于功能开发类工具，优先传 description",
    },
    tools: {
      // 基础工具
      detect_shell: {
        description: "当用户询问当前 AI 环境、是否为套壳产品时使用",
        params: {
          input: "任意格式输入，支持自然语言、JSON 字符串或空字符串",
        },
        examples: [
          { input: "检测环境" },
          { input: "检测是否为套壳" },
          { input: "" },
        ],
      },
      init_setting: {
        description: "当用户需要初始化或配置 Cursor IDE 设置时使用",
        params: {
          input: "任意格式输入，支持自然语言、JSON 字符串或空字符串",
        },
        examples: [
          { input: "初始化配置" },
          { input: "初始化 Cursor 配置" },
          { input: '{"project_path": "/path/to/project"}' },
        ],
      },
      init_project: {
        description: "当用户需要创建新项目、生成项目结构时使用",
        params: {
          input: "项目需求描述或自然语言",
        },
        examples: [
          { input: "创建一个电商网站项目" },
          { input: "创建博客系统" },
          { input: '{"input": "项目需求", "project_name": "my-project"}' },
        ],
      },

      // Git 工具
      gencommit: {
        description: "当用户需要生成 Git commit 消息时使用。返回 Conventional Commits 规范指南，AI 根据指南生成消息",
        params: {
          changes: "代码变更描述或 git diff 输出",
          type: "commit 类型（feat/fix/docs/style/refactor/test/chore）",
        },
        examples: [
          { changes: "帮我生成commit消息" },
          { changes: "修复了登录bug" },
          { changes: "git diff 输出...", type: "fix" },
        ],
      },
      genchangelog: {
        description: "当用户需要生成版本更新日志、准备发布时使用",
        params: {
          version: "版本号",
          from: "起始版本或 tag",
          to: "结束版本或 tag",
        },
        examples: [
          { version: "v1.2.0" },
          { version: "v1.2.0", from: "v1.0.0" },
          { input: "生成 v1.2.0 的 changelog" },
        ],
      },
      genpr: {
        description: "当用户需要创建 Pull Request、生成 PR 描述时使用",
        params: {
          input: "commit 历史或自然语言描述",
        },
        examples: [
          { input: "生成PR描述" },
          { input: "git log 输出..." },
          { input: '{"branch": "feature/xxx", "commits": "..."}' },
        ],
      },
      resolve_conflict: {
        description: "当用户遇到 Git 合并冲突、需要解决冲突时使用",
        params: {
          input: "冲突内容（包含 <<<<<<< ======= >>>>>>> 标记）",
        },
        examples: [
          { input: "<<<<<<< HEAD\ncode1\n=======\ncode2\n>>>>>>> branch" },
          { input: "git diff 输出..." },
        ],
      },

      // 代码分析工具
      debug: {
        description: "当用户遇到错误、需要调试问题时使用",
        params: {
          error: "错误信息",
          context: "相关代码或上下文",
        },
        examples: [
          { error: "TypeError: Cannot read property name of undefined" },
          { input: "帮我调试这个错误：..." },
          { error: "错误信息", context: "相关代码" },
        ],
      },
      code_review: {
        description: "当用户需要审查代码质量、检查代码问题时使用",
        params: {
          code: "要审查的代码",
          focus: "关注点（quality/security/performance）",
        },
        examples: [
          { code: "function login() {...}" },
          { input: "请审查这段代码：function login() {...}" },
          { code: "代码", focus: "security" },
        ],
      },
      explain: {
        description: "当用户不理解某段代码、需要代码解释时使用",
        params: {
          code: "要解释的代码",
          context: "业务背景",
        },
        examples: [
          { code: "function fibonacci(n) {...}" },
          { input: "解释这段代码：..." },
        ],
      },
      perf: {
        description: "当用户关注代码性能、需要优化性能时使用",
        params: {
          code: "要分析的代码",
          type: "分析类型（algorithm/memory/database/react）",
        },
        examples: [
          { code: "for(let i=0; i<n; i++) {...}" },
          { input: "分析这段代码的性能问题：..." },
        ],
      },
      security_scan: {
        description: "当用户关注代码安全、需要检查安全漏洞时使用",
        params: {
          code: "要扫描的代码",
          scan_type: "扫描类型（injection/auth/crypto/sensitive）",
        },
        examples: [
          { code: "function login(username, password) {...}" },
          { input: "扫描这段代码的安全问题：..." },
        ],
      },
      refactor: {
        description: "当用户需要重构代码、改善代码结构时使用",
        params: {
          code: "要重构的代码",
          goal: "重构目标（improve_readability/reduce_complexity）",
        },
        examples: [
          { code: "function process() {...}" },
          { input: "帮我重构这段代码：..." },
        ],
      },
      fix: {
        description: "当用户需要自动修复代码问题（Lint/格式化/类型错误）时使用",
        params: {
          code: "要修复的代码",
          type: "修复类型（lint/ts/format/import）",
        },
        examples: [
          { code: "const x = 1" },
          { input: "修复这段代码的问题：..." },
        ],
      },
      fix_bug: {
        description: "当用户需要修复 Bug、获取修复指导时使用",
        params: {
          error_message: "错误信息",
          stack_trace: "堆栈跟踪",
        },
        examples: [
          { error_message: "Error: Cannot find module..." },
          { input: "帮我修复这个bug：..." },
        ],
      },

      // 代码生成工具
      gentest: {
        description: "当用户需要为代码生成单元测试时使用",
        params: {
          code: "要测试的代码",
          framework: "测试框架（jest/vitest/mocha）",
        },
        examples: [
          { code: "function add(a, b) {...}" },
          { input: "生成测试代码" },
          { code: "函数代码", framework: "jest" },
        ],
      },
      gendoc: {
        description: "当用户需要为代码添加注释、生成文档时使用",
        params: {
          code: "要注释的代码",
          style: "注释风格（jsdoc/tsdoc/javadoc）",
          lang: "语言（zh/en）",
        },
        examples: [
          { code: "function calculate() {...}" },
          { input: "生成代码注释" },
        ],
      },
      genapi: {
        description: "当用户需要生成 API 文档时使用",
        params: {
          code: "API 代码（路由定义、Controller）",
          format: "文档格式（markdown/openapi/jsdoc）",
        },
        examples: [
          { code: "app.get('/users', ...) {...}" },
          { input: "生成 API 文档" },
        ],
      },
      genui: {
        description: "当用户需要生成 UI 组件代码时使用",
        params: {
          description: "组件描述",
          framework: "框架（react/vue/html）",
        },
        examples: [
          { description: "生成一个登录表单组件" },
          { description: "创建用户卡片组件", framework: "react" },
        ],
      },
      gensql: {
        description: "当用户需要根据自然语言生成 SQL 查询时使用",
        params: {
          description: "查询需求描述",
          dialect: "SQL 方言（postgres/mysql/sqlite）",
        },
        examples: [
          { description: "查询所有活跃用户的姓名和邮箱" },
          { description: "从 users 表查询 name 和 email，条件是 status=active" },
        ],
      },
      gen_mock: {
        description: "当用户需要生成测试数据、Mock 数据时使用",
        params: {
          schema: "TypeScript 类型或 JSON Schema",
          count: "生成数量",
          format: "输出格式（json/typescript）",
          locale: "语言环境（zh_CN/en_US）",
        },
        examples: [
          { schema: "interface User { name: string; ... }" },
          { input: "生成10条用户数据", count: 10 },
        ],
      },
      design2code: {
        description: "当用户需要将设计稿转换为代码时使用",
        params: {
          input: "设计稿 URL、描述或 HTML",
          framework: "框架（react/vue/html）",
          style_solution: "样式方案（css/scss/tailwind）",
          component_type: "组件类型（page/component）",
        },
        examples: [
          { input: "https://example.com/design.png" },
          { input: "一个包含标题、输入框和按钮的登录页面" },
        ],
      },

      // 文档和工具类
      genreadme: {
        description: "当用户需要生成项目 README 文档时使用",
        params: {
          project_info: "项目信息或代码",
          style: "风格（simple/detailed）",
        },
        examples: [
          { input: "生成README" },
          { project_info: "项目信息..." },
        ],
      },
      check_deps: {
        description: "当用户需要检查项目依赖健康度、查找过期依赖时使用",
        params: {
          input: "任意输入或空字符串",
        },
        examples: [
          { input: "检查依赖" },
          { input: "" },
        ],
      },
      convert: {
        description: "当用户需要转换代码格式或框架时使用",
        params: {
          code: "要转换的代码",
          from: "源格式（js/class/vue2）",
          to: "目标格式（ts/hooks/vue3）",
        },
        examples: [
          { code: "const x = 1", to: "typescript" },
          { input: "转换为TypeScript：const x = 1" },
        ],
      },
      css_order: {
        description: "当用户需要整理 CSS 属性顺序时使用",
        params: {
          input: "CSS 代码或空字符串",
        },
        examples: [
          { input: ".button { color: red; ... }" },
          { input: "整理CSS属性顺序" },
        ],
      },
      split: {
        description: "当用户需要拆分大文件、模块化代码时使用",
        params: {
          file: "文件内容",
          strategy: "拆分策略（auto/by-type/by-function）",
        },
        examples: [
          { file: "完整的代码文件..." },
          { input: "拆分这个文件：..." },
        ],
      },

      // 项目管理工具
      analyze_project: {
        description: "当用户需要了解项目结构、分析项目技术栈时使用",
        params: {
          project_path: "项目路径",
          max_depth: "扫描深度",
        },
        examples: [
          { input: "分析项目" },
          { project_path: "/path/to/project" },
        ],
      },
      init_project_context: {
        description: "当用户需要生成项目上下文文档、帮助团队快速上手时使用",
        params: {
          docs_dir: "文档目录",
        },
        examples: [
          { input: "生成项目上下文文档" },
          { docs_dir: "docs" },
        ],
      },
      add_feature: {
        description: "当用户需要添加新功能、生成功能规格文档时使用",
        params: {
          description: "功能描述（必需，可以是简短描述或详细需求）",
          feature_name: "功能名称（可选，会从 description 自动提取）",
          docs_dir: "文档目录（可选，默认 docs）",
        },
        examples: [
          { description: "添加用户认证功能" },
          { 
            feature_name: "user-auth",
            description: "实现用户登录、注册、密码重置功能"
          },
        ],
        important: "优先传 description，工具会自动提取 feature_name",
      },
      estimate: {
        description: "当用户需要估算开发工作量、评估任务时间时使用",
        params: {
          task_description: "任务描述",
          code_context: "相关代码",
          team_size: "团队规模",
          experience_level: "经验水平（junior/mid/senior）",
        },
        examples: [
          { task_description: "实现用户认证功能" },
          { input: "估算开发工作量" },
        ],
      },

      // 智能编排工具
      start_feature: {
        description: "当用户需要完整的新功能开发流程时使用。编排：检查上下文→生成规格→估算工作量",
        params: {
          description: "功能描述（必需）",
          feature_name: "功能名称（可选）",
          docs_dir: "文档目录（可选）",
        },
        examples: [
          { description: "开发用户认证功能" },
          { description: "实现支付模块" },
        ],
      },
      start_bugfix: {
        description: "当用户需要完整的 Bug 修复流程时使用。编排：检查上下文→分析定位→修复方案→生成测试",
        params: {
          error_message: "错误信息",
          stack_trace: "堆栈跟踪",
        },
        examples: [
          { error_message: "Error: Cannot find module..." },
          { input: "修复这个bug：..." },
        ],
      },
      start_review: {
        description: "当用户需要全面审查代码时使用。编排：代码审查+安全扫描+性能分析",
        params: {
          code: "要审查的代码",
          language: "编程语言",
        },
        examples: [
          { code: "function process() {...}" },
          { input: "全面审查这段代码：..." },
        ],
      },
      start_release: {
        description: "当用户需要准备版本发布时使用。编排：生成 Changelog→生成 PR 描述",
        params: {
          version: "版本号",
          from_tag: "起始 tag",
        },
        examples: [
          { version: "v1.2.0" },
          { input: "准备发布 v1.2.0" },
        ],
      },
      start_refactor: {
        description: "当用户需要完整的代码重构流程时使用。编排：审查现状→重构建议→生成测试",
        params: {
          code: "要重构的代码",
          goal: "重构目标",
        },
        examples: [
          { code: "function calculate() {...}" },
          { input: "重构这段代码：..." },
        ],
      },
      start_onboard: {
        description: "当用户需要快速上手新项目时使用。编排：分析项目→生成上下文文档",
        params: {
          project_path: "项目路径",
          docs_dir: "文档目录",
        },
        examples: [
          { input: "快速上手这个项目" },
          { project_path: "/path/to/project" },
        ],
      },
      start_api: {
        description: "当用户需要完整的 API 开发流程时使用。编排：生成文档→生成 Mock→生成测试",
        params: {
          code: "API 代码",
          format: "文档格式",
        },
        examples: [
          { code: "app.get('/users', ...) {...}" },
          { input: "生成 API 文档和测试" },
        ],
      },
      start_doc: {
        description: "当用户需要补全项目文档时使用。编排：注释→README→API 文档",
        params: {
          code: "代码",
          style: "注释风格",
        },
        examples: [
          { input: "补全文档" },
          { code: "代码..." },
        ],
      },
      gen_skill: {
        description: "当用户需要生成 Agent Skills 文档时使用",
        params: {
          scope: "范围（all/specific tool name）",
          lang: "语言（zh/en）",
        },
        examples: [
          { input: "生成技能文档" },
          { scope: "all", lang: "zh" },
        ],
      },
    },
  };
}
