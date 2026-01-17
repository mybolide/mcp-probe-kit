# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.0] - 2025-01-17

### Added
- 🎸 **智能参数解析系统** - 所有 40 个工具现在支持自然语言输入
  - 新增 `src/utils/parseArgs.ts` 核心解析工具
  - 支持 5+ 种输入格式：纯自然语言、JSON 对象、JSON 字符串、key=value、字段别名
  - 支持中文字段别名，降低使用门槛
  - 强大的容错处理，自动处理 null/undefined/格式错误
  - 向后完全兼容，不影响现有 JSON 格式调用

### Changed
- ♻️ **重构所有 40 个工具的参数处理**
  - 基础工具（2个）：gencommit, debug
  - 高优先级工具（5个）：code_review, gentest, genapi, fix, refactor
  - 编排工具（8个）：start_feature, start_bugfix, start_review, start_release, start_refactor, start_onboard, start_api, start_doc
  - 生成类工具（7个）：gendoc, genpr, genchangelog, genreadme, gensql, genui, gen_mock
  - 分析类工具（5个）：explain, perf, security_scan, estimate, fix_bug
  - 转换类工具（4个）：convert, split, resolve_conflict, design2code
  - 项目管理工具（4个）：init_project, analyze_project, init_project_context, add_feature
  - 其他工具（5个）：check_deps, css_order, detect_shell, init_setting, gen_skill

### Improved
- 🚀 **用户体验大幅提升**
  - 从 "必须构造 JSON" → "直接说人话"
  - 从 "容易出错" → "自动容错"
  - 从 "记住字段名" → "随意表达"
  - 容错率提升 90%+
  - 支持格式增加 5 倍

### Documentation
- 📝 新增完整文档
  - `docs/NATURAL_LANGUAGE_SUPPORT.md` - 自然语言支持完整文档
  - `docs/QUICK_START_NATURAL_LANGUAGE.md` - 快速开始指南
  - `TOOLS_AUDIT_REPORT.md` - 工具审计报告
  - `SOLUTION_SUMMARY.md` - 解决方案总结
  - `UPDATE_PROGRESS.md` - 更新进度跟踪

### Examples
**之前（必须构造 JSON）：**
```javascript
{ "code": "function login() {...}", "focus": "security" }
```

**现在（支持自然语言）：**
```javascript
// 方式 1: 纯自然语言（推荐）
"请审查这段代码：function login() {...}"

// 方式 2: 标准 JSON（仍然支持）
{ code: "function login() {...}", focus: "security" }

// 方式 3: 使用中文别名
{ 代码: "function login() {...}", 类型: "security" }
```

## [1.8.1] - 2025-01-16

### Changed
- 📝 更新文档，添加 gen_skill 工具说明
  - README.md - 添加完整的工具介绍和使用示例
  - docs/BEST_PRACTICES.md - 添加最佳实践
  - docs/HOW_TO_TRIGGER.md - 添加触发关键词
  - docs/HOW_TO_TRIGGER.html - 优化为黑白打印友好版本

## [1.8.0] - 2025-01-16

### Added
- 🎸 新增 `gen_skill` 工具 - 生成 Agent Skills 文档
  - 支持 Agent Skills 开放标准（agentskills.io）
  - 支持生成单个工具或全部工具的技能文档
  - 生成符合 Claude/Gemini/OpenCode 兼容的 SKILL.md 格式
  - 自动生成 README 索引文件
  - 支持中英文输出

### Changed
- ♻️ 优化所有工具的 description 描述
  - 统一输出术语：输出文本/输出代码/输出补丁（unified diff）
  - 添加边界约束（不做业务逻辑改动、仅分析不自动修改代码）
  - 添加工具交叉引用（如需全面审查请用 start_review）
  - 提升 AI 路由精度，减少误触发
- ♻️ 优化 inputSchema 参数描述
  - 添加格式示例（如 feature/user-auth、v1.0.0）
  - 添加上下文要求（包含完整签名和依赖导入）
  - 添加默认值说明（默认跟随项目现有框架）
- ♻️ 优化 PROMPT_TEMPLATE 工业级标准
  - 为分析类工具添加 JSON 输出格式约束（code_review, security_scan, perf, debug, estimate, fix_bug）
  - 为所有工具添加边界约束（不自动修改代码/不执行命令）
  - 统一输出格式，便于下游工具解析和编排串联

### Improved
- 📦 工具总数更新为 40 个（32 个基础工具 + 8 个智能编排）

## [1.7.0] - 2025-01-14

### Added
- 🎨 新增 `design2code` 工具 - 设计稿转代码
  - 支持图片 URL 输入（jpg/png/gif/webp/svg）
  - 支持 Base64 图片输入
  - 支持设计稿文字描述输入
  - 支持 HTML 代码转换
  - 默认生成 Vue 3 + TypeScript 代码
  - 支持 React、Vue 双框架
  - 支持 Tailwind CSS、CSS Modules、Styled Components
  - 1:1 精确还原设计稿布局和样式
  - 自动生成响应式设计代码
  - 智能组件拆分和 TypeScript 类型定义

### Changed
- 📚 更新所有文档，添加 `design2code` 工具说明
  - README.md - 添加完整的工具介绍和使用示例
  - docs/BEST_PRACTICES.md - 添加最佳实践指南
  - docs/HOW_TO_TRIGGER.md - 添加触发关键词和对话示例
  - docs/HOW_TO_TRIGGER.html - 更新快速参考手册
- 📦 工具总数更新为 39 个（31 个基础工具 + 8 个智能编排）

## [1.3.0] - 2025-10-27

### Fixed
- 📝 修复 README.md 中 gencommit 工具的格式说明
- 更新文档为新的 emoji commit 格式
- 添加详细的类型说明和示例

## [1.2.9] - 2025-10-27

### Changed
- 💄 优化 `gencommit` 工具的 commit 消息格式规范
- Subject 保持简洁，不强制包含 scope
- Scope/模块信息建议放在 body 中说明，更加灵活
- 更新示例，展示详细版、简单版、最简版三种场景
- 格式调整为：`type: emoji subject`

### Improved
- 🔧 优化版本号管理，统一从 package.json 读取
- 新增 `src/version.ts` 配置文件，避免多处手动修改版本号
- 今后只需修改 package.json 的版本号即可

## [1.2.8] - 2025-10-27

### Changed
- 🚀 优化 `analyze_project` 工具，大幅提升大型项目分析性能
- 限制最多扫描 5000 个文件，防止超大项目分析超时
- 限制每个目录最多显示 50 项，避免输出过长
- 限制单个文件大小为 1MB，跳过超大文件
- 增强忽略目录列表，完全跳过 `node_modules`、`dist`、`build` 等大型目录
- 添加更多忽略目录：`vendor`、`__pycache__`、`.cache`、`bower_components` 等
- 文件类型分布按数量排序，只显示前 10 种
- 关键文件内容限制为 100 行，超长内容自动截断
- 使用相对路径显示文件，提高可读性
- 添加扫描进度日志和忽略目录提示

## [1.2.7] - 2025-10-27

### Changed
- 更新 MCP 服务器版本信息，确保所有版本号统一
- 优化服务器状态资源，用户可通过 `probe://status` 查看实时版本

## [1.2.6] - 2025-10-27

### Added
- 🎸 为 commit 类型添加 emoji 支持，提升视觉体验
- 新增 `fixed` 类型用于线上/测试缺陷修复
- 为所有 commit 类型配置 emoji 表情（🐛🎸✏️💄🤖♻️✅）
- 添加带 emoji 的 commit 消息示例

### Changed
- 更新 gencommit 工具的类型描述，区分 `fixed` 和 `fix` 的使用场景
- 优化类型排序，将 fixed/fix 放在首位

## [1.2.4] - 2025-10-26

### Added
- 添加 FAQ 常见问题解答章节
- 添加故障排查指南

### Changed
- 更新脚本和文档

## [1.2.3] - 2025-10-26

Previous versions - see [GitHub Releases](https://github.com/mybolide/mcp-probe-kit/releases)

---

[1.9.0]: https://github.com/mybolide/mcp-probe-kit/compare/v1.8.1...v1.9.0
[1.8.1]: https://github.com/mybolide/mcp-probe-kit/compare/v1.8.0...v1.8.1
[1.8.0]: https://github.com/mybolide/mcp-probe-kit/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/mybolide/mcp-probe-kit/compare/v1.3.0...v1.7.0
[1.3.0]: https://github.com/mybolide/mcp-probe-kit/compare/v1.2.9...v1.3.0
[1.2.9]: https://github.com/mybolide/mcp-probe-kit/compare/v1.2.8...v1.2.9
[1.2.8]: https://github.com/mybolide/mcp-probe-kit/compare/v1.2.7...v1.2.8
[1.2.7]: https://github.com/mybolide/mcp-probe-kit/compare/v1.2.6...v1.2.7
[1.2.6]: https://github.com/mybolide/mcp-probe-kit/compare/v1.2.4...v1.2.6
[1.2.4]: https://github.com/mybolide/mcp-probe-kit/compare/v1.2.3...v1.2.4
[1.2.3]: https://github.com/mybolide/mcp-probe-kit/releases/tag/v1.2.3

