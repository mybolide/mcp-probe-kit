#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { 
  detectShell, initSetting, initProject, gencommit, debug, genapi,
  codeReview, gentest, genpr, checkDeps, gendoc, genchangelog, refactor, perf,
  fix, gensql, resolveConflict, genui, explain, convert, cssOrder, genreadme, split, analyzeProject,
  initProjectContext, addFeature, securityScan, fixBug, estimate, genMock, design2code,
  startFeature, startBugfix, startReview, startRelease, startRefactor, startOnboard, startApi, startDoc,
  genSkill
} from "./tools/index.js";
import { VERSION, NAME } from "./version.js";

// 创建MCP服务器实例
const server = new Server(
  {
    name: NAME,
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// 定义工具列表
// 注意：所有工具都支持自然语言输入！
// 用户可以直接用自然语言描述需求，无需构造复杂的 JSON 对象
// 例如：直接说 "帮我生成 commit 消息" 或 "请审查这段代码：function login() {...}"
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "detect_shell",
        description: "🎯 支持自然语言输入！可直接说'检测环境'。检测 AI 应用环境指纹，识别是否为套壳产品；返回 JSON 检测报告；仅基于环境指纹判断，不做法律/归因结论",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'检测环境' 或 '检测是否为套壳'\n2) JSON字符串：'{\"nonce\":\"...\", \"skip_network\":true}'\n3) 空字符串：使用默认配置",
        },
      },
      {
        name: "init_setting",
        description: "🎯 支持自然语言输入！可直接说'初始化 Cursor 配置'。初始化 Cursor IDE 配置，写入推荐的 AI 设置到 .cursor/settings.json",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'初始化配置' 或 '初始化 Cursor 配置'\n2) JSON字符串：'{\"project_path\":\"/path/to/project\"}'\n3) 空字符串：使用当前工作区路径",
        },
      },
      {
        name: "init_project",
        description: "🎯 支持自然语言输入！可直接说'创建新项目'或描述项目需求。创建新项目结构和任务分解，按 Spec-Driven Development 方式生成需求/设计/任务文档",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'创建一个电商网站项目' 或 '创建博客系统'\n2) 项目需求描述：详细的功能需求文档\n3) JSON字符串：'{\"input\":\"项目需求\", \"project_name\":\"my-project\"}'",
        },
      },
      {
        name: "gencommit",
        description: "🎯 支持自然语言输入！可直接说'帮我生成commit消息'或'修复了登录bug'。分析代码变更生成 Git commit 消息，支持 Conventional Commits 和 emoji；输出文本，不执行提交",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'帮我生成commit消息' 或 '修复了登录bug'\n2) git diff 输出：直接粘贴 git diff 结果\n3) JSON字符串：'{\"changes\":\"修复bug\", \"type\":\"fixed\"}'\n4) 空字符串：将自动获取 git diff",
        },
      },
      {
        name: "debug",
        description: "🎯 支持自然语言输入！可直接粘贴错误信息如'TypeError: Cannot read property name of undefined'。分析错误信息和堆栈，定位问题根因，输出调试策略和解决方案；仅分析定位，不修复代码",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴错误信息：'TypeError: Cannot read property...'\n2) 完整错误+堆栈：包含错误消息和堆栈跟踪\n3) JSON字符串：'{\"error\":\"错误信息\", \"context\":\"相关代码\"}'",
        },
      },
      {
        name: "genapi",
        description: "🎯 支持自然语言输入！可直接粘贴 API 代码。生成 API 文档（Markdown/OpenAPI/JSDoc），包含参数说明与示例；基于现有接口定义/路由/注释推断；输出文本，不修改业务代码",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴 API 代码：路由定义、Controller 或接口函数\n2) 自然语言：'生成 API 文档'\n3) JSON字符串：'{\"code\":\"API代码\", \"format\":\"openapi\"}'",
        },
      },
      {
        name: "code_review",
        description: "🎯 支持自然语言输入！可直接粘贴代码如'请审查这段代码：function login() {...}'。审查代码质量、安全性、性能，输出结构化问题清单（severity/category/file/line/suggestion）；仅分析，不自动修改代码",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴代码：'function login() {...}'\n2) 带说明：'请审查这段代码：...'\n3) git diff 输出\n4) JSON字符串：'{\"code\":\"代码\", \"focus\":\"security\"}'",
        },
      },
      {
        name: "gentest",
        description: "🎯 支持自然语言输入！可直接粘贴需要测试的代码。生成单元测试代码（Jest/Vitest/Mocha），包含边界用例和 mock；默认跟随项目现有测试框架与语言；输出代码，不运行测试",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴代码：'function add(a, b) {...}'\n2) 自然语言：'生成测试代码'\n3) JSON字符串：'{\"code\":\"函数代码\", \"framework\":\"jest\"}'",
        },
      },
      {
        name: "genpr",
        description: "🎯 支持自然语言输入！可直接说'生成PR描述'或粘贴 commit 历史。生成 Pull Request 描述，包含变更摘要、影响范围、测试说明；输出文本，不创建 PR",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'生成PR描述' 或 '生成发布说明'\n2) 粘贴 commit 历史：git log 输出\n3) JSON字符串：'{\"branch\":\"feature/xxx\", \"commits\":\"...\"}'",
        },
      },
      {
        name: "check_deps",
        description: "🎯 支持自然语言输入！可直接说'检查依赖'。检查依赖健康度（版本过期/安全漏洞/体积），输出升级建议（含潜在 breaking 风险）；仅分析，不自动升级",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'检查依赖' 或 '检查依赖健康度'\n2) 空字符串：自动检查当前项目依赖",
        },
      },
      {
        name: "gendoc",
        description: "🎯 支持自然语言输入！可直接粘贴需要注释的代码。生成代码注释（JSDoc/TSDoc/Javadoc），补全参数/返回值/异常/示例；输出代码，不改变逻辑",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴代码：'function calculate() {...}'\n2) 自然语言：'生成代码注释'\n3) JSON字符串：'{\"code\":\"代码\", \"style\":\"jsdoc\", \"lang\":\"zh\"}'",
        },
      },
      {
        name: "genchangelog",
        description: "🎯 支持自然语言输入！可直接说'生成 v1.2.0 的 changelog'。根据 commit 历史生成 CHANGELOG，按 feat/fix/breaking 分类；输出文本，不打 tag",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'生成 v1.2.0 的 changelog' 或 '生成变更日志'\n2) 版本号：'v1.2.0'\n3) JSON字符串：'{\"version\":\"v1.2.0\", \"from\":\"v1.0.0\"}'",
        },
      },
      {
        name: "refactor",
        description: "🎯 支持自然语言输入！可直接粘贴代码并说'帮我重构这段代码'。分析代码结构提供重构建议，输出重构步骤和风险评估；仅建议，不自动重构",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴代码：'function process() {...}'\n2) 带说明：'帮我重构这段代码：...'\n3) JSON字符串：'{\"code\":\"代码\", \"goal\":\"improve_readability\"}'",
        },
      },
      {
        name: "perf",
        description: "🎯 支持自然语言输入！可直接粘贴代码并说'分析性能问题'。分析性能瓶颈（算法/内存/数据库/React渲染），输出结构化瓶颈清单（evidence/fix/impact）；如需全面审查请用 start_review",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴代码：'for(let i=0; i<n; i++) {...}'\n2) 带说明：'分析这段代码的性能问题：...'\n3) JSON字符串：'{\"code\":\"代码\", \"type\":\"algorithm\"}'",
        },
      },
      {
        name: "fix",
        description: "🎯 支持自然语言输入！可直接粘贴代码并说'修复这段代码的问题'。自动修复可机械化问题（Lint/TS/格式化/导入/未使用变量），输出补丁（unified diff）；不做业务逻辑改动",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴代码：'const x = 1'\n2) 带说明：'修复这段代码的问题：...'\n3) JSON字符串：'{\"code\":\"代码\", \"type\":\"lint\"}'",
        },
      },
      {
        name: "gensql",
        description: "🎯 完全支持自然语言输入！可直接说'查询所有活跃用户的姓名和邮箱'。根据自然语言生成 SQL 语句（PostgreSQL/MySQL/SQLite）；输出文本，不执行查询",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'查询所有活跃用户的姓名和邮箱'\n2) 查询需求：'从 users 表查询 name 和 email，条件是 status=active'\n3) JSON字符串：'{\"description\":\"查询需求\", \"dialect\":\"postgres\"}'",
        },
      },
      {
        name: "resolve_conflict",
        description: "🎯 支持自然语言输入！可直接粘贴冲突内容。分析 Git 合并冲突，理解双方意图，输出补丁（unified diff）；需人工确认后应用",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴冲突内容：包含 <<<<<<< ======= >>>>>>> 标记的文件\n2) git diff 输出\n3) JSON字符串：'{\"conflicts\":\"冲突内容\"}'",
        },
      },
      {
        name: "genui",
        description: "🎯 支持自然语言输入！可直接说'生成一个登录表单组件'。生成 UI 组件代码（React/Vue/HTML），包含 Props 和样式；默认跟随项目现有前端栈与组件风格；输出代码",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'生成一个登录表单组件' 或 '创建用户卡片组件'\n2) 详细描述：包含交互行为、状态、样式要求\n3) JSON字符串：'{\"description\":\"组件描述\", \"framework\":\"react\"}'",
        },
      },
      {
        name: "explain",
        description: "🎯 支持自然语言输入！可直接粘贴代码并说'解释这段代码'。解释代码逻辑和实现原理，包含执行流程、关键概念；输出文本，不修改代码",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴代码：'function fibonacci(n) {...}'\n2) 带说明：'解释这段代码：...'\n3) JSON字符串：'{\"code\":\"代码\", \"context\":\"业务背景\"}'",
        },
      },
      {
        name: "convert",
        description: "🎯 支持自然语言输入！可直接粘贴代码并说'转换为TypeScript'。转换代码格式或框架（JS→TS/Class→Hooks/Vue2→Vue3），保持逻辑不变；输出代码",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 带说明：'转换为TypeScript：const x = 1'\n2) 直接粘贴代码（会自动识别转换方向）\n3) JSON字符串：'{\"code\":\"代码\", \"from\":\"js\", \"to\":\"ts\"}'",
        },
      },
      {
        name: "css_order",
        description: "🎯 支持自然语言输入！可直接粘贴CSS代码。重排 CSS 属性顺序，按布局→盒模型→视觉→其他规则整理；输出文本",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴CSS代码：'.button { color: red; ... }'\n2) 自然语言：'整理CSS属性顺序'\n3) 空字符串：处理当前文件的CSS",
        },
      },
      {
        name: "genreadme",
        description: "🎯 支持自然语言输入！可直接说'生成README'或粘贴项目信息。生成 README（介绍/安装/使用/脚本/FAQ）；输出文本；如需 OpenAPI 请用 genapi 或 start_doc",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'生成README' 或 '生成项目文档'\n2) 粘贴项目信息或代码\n3) JSON字符串：'{\"project_info\":\"项目信息\", \"style\":\"detailed\"}'",
        },
      },
      {
        name: "split",
        description: "🎯 支持自然语言输入！可直接粘贴大文件内容并说'拆分这个文件'。拆分大文件为小模块，按类型/功能/组件策略拆分；尽量保持对外导出与行为不变；输出代码",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴文件内容：完整的代码文件\n2) 带说明：'拆分这个文件：...'\n3) JSON字符串：'{\"file\":\"文件内容\", \"strategy\":\"auto\"}'",
        },
      },
      {
        name: "analyze_project",
        description: "🎯 支持自然语言输入！可直接说'分析项目'。分析项目结构、技术栈、架构模式，输出项目全景报告；如需生成上下文文档请用 init_project_context",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'分析项目' 或 '分析项目结构'\n2) 项目路径：'/path/to/project'\n3) JSON字符串：'{\"project_path\":\"路径\", \"max_depth\":5}'",
        },
      },
      {
        name: "init_project_context",
        description: "🎯 支持自然语言输入！可直接说'生成项目上下文文档'。生成项目上下文文档（技术栈/架构/编码规范），供后续开发参考；如需分析项目请先用 analyze_project",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'生成项目上下文文档' 或 '生成开发文档'\n2) 文档目录：'docs'\n3) JSON字符串：'{\"docs_dir\":\"docs\"}'",
        },
      },
      {
        name: "add_feature",
        description: "🎯 支持自然语言输入！可直接说'添加用户认证功能'。生成新功能规格文档（需求/设计/任务清单），基于项目上下文；如需完整流程请用 start_feature",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'添加用户认证功能' 或 '实现支付功能'\n2) 功能描述：详细的功能需求说明\n3) JSON字符串：'{\"feature_name\":\"user-auth\", \"description\":\"功能描述\"}'",
        },
      },
      {
        name: "security_scan",
        description: "🎯 支持自然语言输入！可直接粘贴代码并说'扫描安全问题'。专项安全漏洞扫描（注入/认证/加密/敏感数据），输出结构化风险清单（severity/type/location/fix）；如需全面审查请用 start_review",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴代码：'function login(username, password) {...}'\n2) 带说明：'扫描这段代码的安全问题：...'\n3) JSON字符串：'{\"code\":\"代码\", \"scan_type\":\"injection\"}'",
        },
      },
      {
        name: "fix_bug",
        description: "🎯 支持自然语言输入！可直接粘贴错误信息并说'帮我修复这个bug'。指导 Bug 修复流程，输出根因分析+修复方案+验证步骤；不保证自动修改代码，如要自动改可配合 fix",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴错误信息：'Error: Cannot find module...'\n2) 带说明：'帮我修复这个bug：...'\n3) JSON字符串：'{\"error_message\":\"错误\", \"stack_trace\":\"堆栈\"}'",
        },
      },
      {
        name: "estimate",
        description: "🎯 支持自然语言输入！可直接说'估算开发工作量'或描述任务。估算开发工作量，输出故事点、时间范围（乐观/正常/悲观）、风险点；仅估算，不生成代码",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'估算开发工作量' 或 '评估这个任务需要多久'\n2) 任务描述：详细的功能需求和技术要求\n3) JSON字符串：'{\"task_description\":\"任务\", \"team_size\":3}'",
        },
      },
      {
        name: "gen_mock",
        description: "🎯 支持自然语言输入！可直接粘贴类型定义或说'生成用户数据'。根据 TypeScript 类型或 JSON Schema 生成 Mock 数据；输出文本，不写入数据库",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴类型定义：'interface User { name: string; ... }'\n2) 自然语言：'生成10条用户数据'\n3) JSON字符串：'{\"schema\":\"类型定义\", \"count\":10}'",
        },
      },
      {
        name: "design2code",
        description: "🎯 支持自然语言输入！可直接粘贴设计稿URL或描述。设计稿转代码（图片URL/描述/HTML→Vue/React），1:1 还原布局和样式；默认输出与项目一致的框架与样式方案；输出代码",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 设计稿图片 URL：'https://example.com/design.png'\n2) 设计稿描述：'一个包含标题、输入框和按钮的登录页面'\n3) HTML 源码或 base64 图片\n4) JSON字符串：'{\"input\":\"URL或描述\", \"framework\":\"vue\"}'",
        },
      },
      // ========== 智能编排工具 ==========
      {
        name: "start_feature",
        description: "🎯 支持自然语言输入！可直接说'开发用户认证功能'。新功能开发编排：检查上下文→生成规格→估算工作量；若只需规格文档请用 add_feature",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'开发用户认证功能' 或 '实现支付模块'\n2) 功能描述：详细的功能需求\n3) JSON字符串：'{\"feature_name\":\"user-auth\", \"description\":\"功能描述\"}'",
        },
      },
      {
        name: "start_bugfix",
        description: "🎯 支持自然语言输入！可直接粘贴错误信息。Bug 修复编排：检查上下文→分析定位→修复方案→生成测试；若只需定位与调试策略请用 debug；若只需修复流程指导请用 fix_bug",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴错误信息：'Error: Cannot find module...'\n2) 带说明：'修复这个bug：...'\n3) JSON字符串：'{\"error_message\":\"错误\", \"stack_trace\":\"堆栈\"}'",
        },
      },
      {
        name: "start_review",
        description: "🎯 支持自然语言输入！可直接粘贴代码并说'全面审查这段代码'。代码全面体检：代码审查+安全扫描+性能分析，输出综合报告；若只需单项请用对应工具",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴代码：'function process() {...}'\n2) 带说明：'全面审查这段代码：...'\n3) JSON字符串：'{\"code\":\"代码\", \"language\":\"typescript\"}'",
        },
      },
      {
        name: "start_release",
        description: "🎯 支持自然语言输入！可直接说'准备发布 v1.2.0'。发布准备编排：生成 Changelog→生成 PR 描述；若只需单项请用 genchangelog 或 genpr",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'准备发布 v1.2.0' 或 '生成发布文档'\n2) 版本号：'v1.2.0'\n3) JSON字符串：'{\"version\":\"v1.2.0\", \"from_tag\":\"v1.0.0\"}'",
        },
      },
      {
        name: "start_refactor",
        description: "🎯 支持自然语言输入！可直接粘贴代码并说'重构这段代码'。代码重构编排：审查现状→重构建议→生成测试；若只需建议请用 refactor",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴代码：'function calculate() {...}'\n2) 带说明：'重构这段代码：...'\n3) JSON字符串：'{\"code\":\"代码\", \"goal\":\"reduce_complexity\"}'",
        },
      },
      {
        name: "start_onboard",
        description: "🎯 支持自然语言输入！可直接说'快速上手这个项目'。快速上手编排：分析项目→生成上下文文档；若只需分析请用 analyze_project",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'快速上手这个项目' 或 '生成项目文档'\n2) 项目路径：'/path/to/project'\n3) JSON字符串：'{\"project_path\":\"路径\", \"docs_dir\":\"docs\"}'",
        },
      },
      {
        name: "start_api",
        description: "🎯 支持自然语言输入！可直接粘贴 API 代码。API 开发编排：生成文档→生成 Mock→生成测试；若只需单项请用对应生成工具",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 直接粘贴 API 代码：'app.get(\"/users\", ...) {...}'\n2) 自然语言：'生成 API 文档和测试'\n3) JSON字符串：'{\"code\":\"API代码\", \"format\":\"openapi\"}'",
        },
      },
      {
        name: "start_doc",
        description: "🎯 支持自然语言输入！可直接粘贴代码或说'补全文档'。文档补全编排：注释→README→API 文档；若只需单项文档请用对应生成工具",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'补全文档' 或 '生成完整文档'\n2) 直接粘贴代码\n3) JSON字符串：'{\"code\":\"代码\", \"style\":\"jsdoc\"}'",
        },
      },
      {
        name: "gen_skill",
        description: "🎯 支持自然语言输入！可直接说'生成技能文档'。生成 Agent Skills 文档，为 MCP Probe Kit 工具生成符合开放标准的技能文档；输出到 skills/ 目录，用户可自行修改扩展",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true,
          description: "💡 支持多种输入格式：\n1) 自然语言：'生成技能文档' 或 '生成所有工具的文档'\n2) 工具名称：'code_review'\n3) JSON字符串：'{\"scope\":\"all\", \"lang\":\"zh\"}'",
        },
      },
    ],
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "detect_shell":
        return await detectShell(args);

      case "init_setting":
        return await initSetting(args);

      case "init_project":
        return await initProject(args);

      case "gencommit":
        return await gencommit(args);

      case "debug":
        return await debug(args);

      case "genapi":
        return await genapi(args);

      case "code_review":
        return await codeReview(args);

      case "gentest":
        return await gentest(args);

      case "genpr":
        return await genpr(args);

      case "check_deps":
        return await checkDeps(args);

      case "gendoc":
        return await gendoc(args);

      case "genchangelog":
        return await genchangelog(args);

      case "refactor":
        return await refactor(args);

      case "perf":
        return await perf(args);

      case "fix":
        return await fix(args);

      case "gensql":
        return await gensql(args);

      case "resolve_conflict":
        return await resolveConflict(args);

      case "genui":
        return await genui(args);

      case "explain":
        return await explain(args);

      case "convert":
        return await convert(args);

      case "css_order":
        return await cssOrder(args);

      case "genreadme":
        return await genreadme(args);

      case "split":
        return await split(args);

      case "analyze_project":
        return await analyzeProject(args);

      case "init_project_context":
        return await initProjectContext(args);

      case "add_feature":
        return await addFeature(args);

      case "security_scan":
        return await securityScan(args);

      case "fix_bug":
        return await fixBug(args);

      case "estimate":
        return await estimate(args);

      case "gen_mock":
        return await genMock(args);

      case "design2code":
        return await design2code(args);

      // 智能编排工具
      case "start_feature":
        return await startFeature(args);

      case "start_bugfix":
        return await startBugfix(args);

      case "start_review":
        return await startReview(args);

      case "start_release":
        return await startRelease(args);

      case "start_refactor":
        return await startRefactor(args);

      case "start_onboard":
        return await startOnboard(args);

      case "start_api":
        return await startApi(args);

      case "start_doc":
        return await startDoc(args);

      case "gen_skill":
        return await genSkill(args);

      default:
        throw new Error(`未知工具: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `错误: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// 定义资源列表
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "probe://status",
        name: "服务器状态",
        description: "MCP Probe Kit 服务器当前状态",
        mimeType: "application/json",
      },
    ],
  };
});

// 读取资源
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "probe://status") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              status: "running",
              timestamp: new Date().toISOString(),
              serverInfo: {
                name: NAME,
                version: VERSION,
                description: "Cursor 开发增强工具集",
              },
              tools: {
                detect_shell: "enabled",
                init_setting: "enabled",
                init_project: "enabled",
                gencommit: "enabled",
                debug: "enabled",
                genapi: "enabled",
                code_review: "enabled",
                gentest: "enabled",
                genpr: "enabled",
                check_deps: "enabled",
                gendoc: "enabled",
                genchangelog: "enabled",
                refactor: "enabled",
                perf: "enabled",
                fix: "enabled",
                gensql: "enabled",
                resolve_conflict: "enabled",
                genui: "enabled",
                explain: "enabled",
                convert: "enabled",
                css_order: "enabled",
                genreadme: "enabled",
                split: "enabled",
                analyze_project: "enabled",
                init_project_context: "enabled",
                add_feature: "enabled",
                security_scan: "enabled",
                fix_bug: "enabled",
                estimate: "enabled",
                gen_mock: "enabled",
                design2code: "enabled",
                // 智能编排
                start_feature: "enabled",
                start_bugfix: "enabled",
                start_review: "enabled",
                start_release: "enabled",
                start_refactor: "enabled",
                start_onboard: "enabled",
                start_api: "enabled",
                start_doc: "enabled",
                gen_skill: "enabled",
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  throw new Error(`未知资源: ${uri}`);
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Probe Kit 服务器已启动");
}

// 启动服务器
main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});

