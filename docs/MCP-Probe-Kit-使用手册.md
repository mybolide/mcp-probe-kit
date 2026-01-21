# MCP Probe Kit 工具使用手册

## 🎯 需求访谈工具 🆕

### 1. interview - 需求访谈模式
**用途：** 在开发前通过结构化访谈澄清需求，避免理解偏差

**核心理念：** 先慢下来，把问题想清楚，反而能更快地交付正确的解决方案

**提问示例：**
- "interview 用户登录功能"
- "帮我访谈一下这个需求：商品推荐系统"
- "需求不太明确，先访谈一下"

**参数说明：**
- `description`: 功能描述（必填）
- `context`: 补充背景（可选）

**访谈内容：**
- **阶段 1**: 背景理解（3个问题）- 痛点、用户、业务驱动
- **阶段 2**: 功能边界（4个问题）- 核心价值、范围、输入输出
- **阶段 3**: 技术约束（4个问题）- 技术栈、性能、兼容性、安全
- **阶段 4**: 验收标准（3个问题）- 成功标准、测试场景、效果衡量

**工作流程：**
```
1. AI 生成 12-15 个结构化问题
2. 用户回答所有问题
3. AI 生成访谈记录 docs/interviews/{feature-name}-interview.md
4. 用户选择：
   - 立即开发: start_feature --from-interview {feature-name}
   - 生成规格: add_feature --from-interview {feature-name}
   - 稍后开发: 访谈记录已保存，随时可用
```

**适用场景：**
- ✅ 需求不明确的新功能
- ✅ 复杂的业务功能
- ✅ 涉及多方协作的功能
- ❌ 简单的 Bug 修复
- ❌ 需求非常明确的功能

---

### 2. ask_user - AI 主动提问
**用途：** AI 可在任何时候向用户提问，澄清不确定的信息

**提问示例：**
- AI 会自动调用（当遇到不确定因素时）
- 用户也可主动触发："有什么需要我确认的吗？"

**参数说明：**
- `question`: 问题内容（必填）
- `questions`: 多个问题列表（可选）
- `options`: 选项列表（可选）
- `context`: 问题背景（可选）
- `required`: 是否必答（可选）

**使用场景：**
```
场景1: 代码审查时
AI: "发现了性能问题，但不确定优先级"
调用: ask_user "这个性能问题的优先级如何？是否需要立即优化？"

场景2: 技术方案选择
AI: "可以用两种方案，不确定你的偏好"
调用: ask_user --options ["方案A: 性能优先", "方案B: 可读性优先"]

场景3: Bug 修复时
AI: "需要确认是否向后兼容"
调用: ask_user "修复这个 Bug 是否需要保持向后兼容？"
```

---

## 📋 基础生成工具

### 1. gencommit - 生成 Git 提交信息
**用途：** 根据代码变更自动生成规范的 commit 消息

**提问示例：**
- "帮我生成这次改动的 commit 消息"
- "根据当前 git diff 生成 commit"
- "生成一个 feat 类型的提交信息"

**参数说明：**
- `type`: fix/feat/docs/style/chore/refactor/test
- `changes`: 代码变更内容（可选，默认使用 git diff）

---

### 2. gentest - 生成单元测试
**用途：** 为函数/类/模块生成测试代码

**提问示例：**
- "为这个函数生成单元测试：[粘贴代码]"
- "生成 Jest 测试用例"
- "帮我写这个组件的测试"

**参数说明：**
- `code`: 需要测试的代码（必填）
- `framework`: jest/vitest/mocha（可选）

---

### 3. genapi - 生成 API 文档
**用途：** 根据接口代码生成文档

**提问示例：**
- "为这个 API 生成文档：[粘贴路由代码]"
- "生成 OpenAPI 格式的接口文档"
- "帮我写这个 Controller 的 API 文档"

**参数说明：**
- `code`: API 代码（必填）
- `format`: markdown/openapi/jsdoc

---

### 4. gendoc - 生成代码注释
**用途：** 为代码补充 JSDoc/TSDoc 注释

**提问示例：**
- "为这个函数添加注释：[粘贴代码]"
- "生成 TSDoc 格式的注释"
- "补充这个类的文档注释"

**参数说明：**
- `code`: 需要注释的代码（必填）
- `style`: jsdoc/tsdoc/javadoc
- `lang`: zh/en

---

### 5. genreadme - 生成 README
**用途：** 生成项目说明文档

**提问示例：**
- "为这个项目生成 README"
- "生成详细版的 README 文档"
- "帮我写项目介绍文档"

**参数说明：**
- `project_info`: 项目信息或代码（必填）
- `style`: standard/minimal/detailed

---

### 6. genchangelog - 生成变更日志
**用途：** 根据 commit 历史生成 CHANGELOG

**提问示例：**
- "生成 v1.2.0 的 CHANGELOG"
- "从 v1.0.0 到现在的变更日志"
- "帮我整理这个版本的更新内容"

**参数说明：**
- `version`: 版本号（必填）
- `from`: 起始 tag/commit
- `to`: 结束 tag/commit

---

### 7. genpr - 生成 PR 描述
**用途：** 生成 Pull Request 说明

**提问示例：**
- "为当前分支生成 PR 描述"
- "根据 commit 历史生成 PR 说明"
- "帮我写 PR 文档"

**参数说明：**
- `branch`: 分支名称（可选）
- `commits`: commit 历史（可选）

---

### 8. gensql - 自然语言转 SQL
**用途：** 根据描述生成 SQL 语句

**提问示例：**
- "查询所有状态为已发布的商品，按创建时间倒序"
- "生成一个联表查询，关联用户和订单表"
- "写一个统计每个分类下商品数量的 SQL"

**参数说明：**
- `description`: 查询需求描述（必填）
- `dialect`: postgres/mysql/sqlite

---

### 9. genui - 生成 UI 组件
**用途：** 根据描述生成前端组件代码

**提问示例：**
- "生成一个带搜索的表格组件"
- "创建一个 Vue 的用户卡片组件"
- "帮我写一个 React 的表单组件"

**参数说明：**
- `description`: 组件功能描述（必填）
- `framework`: react/vue/html

---

### 10. gen_mock - 生成 Mock 数据
**用途：** 根据类型定义生成测试数据

**提问示例：**
- "根据这个接口生成 10 条 mock 数据：[粘贴 interface]"
- "生成用户列表的测试数据"
- "帮我造一些商品数据"

**参数说明：**
- `schema`: 数据结构定义（必填）
- `count`: 生成数量（默认 1）
- `format`: json/typescript/javascript/csv
- `locale`: zh-CN/en-US

---

### 11. gen_skill - 生成 Agent Skills 文档
**用途：** 为工具生成技能文档

**提问示例：**
- "生成所有工具的技能文档"
- "为 code_review 生成 SKILL.md"
- "导出工具使用说明"

**参数说明：**
- `scope`: all/basic/generation/analysis（可选）
- `tool_name`: 指定工具名称（可选）
- `lang`: zh/en
- `output_dir`: 输出目录（可选）

---

### 12. design2code - 设计稿转代码
**用途：** 将设计稿转换为前端代码

**提问示例：**
- "根据这个设计稿生成代码：[图片 URL]"
- "把这个 UI 转成 Vue 组件"
- "实现这个页面布局：[描述或图片]"

**参数说明：**
- `input`: 图片 URL/base64/HTML/描述（必填）
- `framework`: vue/react
- `component_type`: page/component
- `style_solution`: tailwind/css-modules/styled-components

---

## 🔍 分析诊断工具

### 1. debug - 错误调试分析
**用途：** 分析错误信息，定位问题根因

**提问示例：**
- "帮我调试这个错误：TypeError: Cannot read property 'map' of undefined at ProductList.vue:45"
- "分析这个报错：[粘贴完整错误堆栈]"
- "为什么会出现这个问题：[描述错误现象]"

**参数说明：**
- `error`: 完整错误信息（必填）
- `context`: 相关代码、复现步骤

---

### 2. code_review - 代码审查
**用途：** 审查代码质量、安全性、性能

**提问示例：**
- "审查这段代码：[粘贴代码]"
- "检查这个文件的安全问题"
- "帮我 review 这个 PR 的代码"

**参数说明：**
- `code`: 代码内容（必填）
- `focus`: quality/security/performance/all

---

### 3. security_scan - 安全扫描
**用途：** 专项安全漏洞检测

**提问示例：**
- "扫描这段代码的安全问题：[粘贴代码]"
- "检查 SQL 注入风险"
- "分析这个接口的安全隐患"

**参数说明：**
- `code`: 代码内容（必填）
- `scan_type`: all/injection/auth/crypto/sensitive_data

---

### 4. perf - 性能分析
**用途：** 分析性能瓶颈

**提问示例：**
- "分析这段代码的性能问题：[粘贴代码]"
- "检查这个循环的性能"
- "优化这个 React 组件的渲染"

**参数说明：**
- `code`: 代码内容（必填）
- `type`: algorithm/memory/react/database/all

---

### 5. check_deps - 依赖检查
**用途：** 检查依赖健康度和安全漏洞

**提问示例：**
- "检查项目依赖的安全问题"
- "分析 package.json 的依赖版本"
- "有哪些依赖需要升级"

**无需参数**

---

### 6. explain - 代码解释
**用途：** 解释代码逻辑和实现原理

**提问示例：**
- "解释这段代码的作用：[粘贴代码]"
- "这个函数是怎么工作的"
- "帮我理解这个算法"

**参数说明：**
- `code`: 代码内容（必填）
- `context`: 补充说明（可选）

---

### 7. analyze_project - 项目分析
**用途：** 分析项目结构、技术栈、架构

**提问示例：**
- "分析当前项目的结构"
- "生成项目技术栈报告"
- "帮我了解这个项目的架构"

**参数说明：**
- `project_path`: 项目路径（可选）
- `max_depth`: 目录深度（默认 5）
- `include_content`: 是否包含文件内容

---

## 🔧 重构优化工具

### 1. refactor - 重构建议
**用途：** 提供代码重构方案

**提问示例：**
- "这段代码如何重构：[粘贴代码]"
- "帮我优化这个函数的可读性"
- "提取这段重复代码"

**参数说明：**
- `code`: 代码内容（必填）
- `goal`: improve_readability/reduce_complexity/extract_function/remove_duplication

---

### 2. fix - 自动修复
**用途：** 自动修复 Lint/格式化/类型错误

**提问示例：**
- "修复这段代码的 Lint 错误：[粘贴代码]"
- "自动格式化这个文件"
- "修复 TypeScript 类型错误"

**参数说明：**
- `code`: 代码内容（必填）
- `type`: lint/type/format/import/unused/all

---

### 3. convert - 代码转换
**用途：** 转换代码格式或框架

**提问示例：**
- "把这段 JS 转成 TS：[粘贴代码]"
- "将 Vue2 代码转换为 Vue3"
- "Class 组件改成 Hooks"

**参数说明：**
- `code`: 源代码（必填）
- `from`: 源格式（js/ts/vue2/vue3/class/hooks）
- `to`: 目标格式

---

### 4. split - 文件拆分
**用途：** 拆分大文件为小模块

**提问示例：**
- "拆分这个大文件：[粘贴代码]"
- "按功能拆分这个组件"
- "帮我模块化这段代码"

**参数说明：**
- `file`: 文件内容或路径（必填）
- `strategy`: auto/type/function/component/feature

---

### 5. resolve_conflict - 解决冲突
**用途：** 分析并解决 Git 合并冲突

**提问示例：**
- "帮我解决这个合并冲突：[粘贴冲突内容]"
- "分析这个 conflict 应该保留哪边"
- "合并这两个版本的代码"

**参数说明：**
- `conflicts`: 冲突文件内容（必填）

---

### 6. design2code - 设计稿转代码
**用途：** 将设计稿转换为前端代码

**提问示例：**
- "根据这个设计稿生成代码：[图片 URL]"
- "把这个 UI 转成 Vue 组件"
- "实现这个页面布局：[描述或图片]"

**参数说明：**
- `input`: 图片 URL/base64/HTML/描述（必填）
- `framework`: vue/react
- `component_type`: page/component
- `style_solution`: tailwind/css-modules/styled-components

---

## 🎯 工作流编排工具

### 1. start_feature - 新功能开发流程
**用途：** 完整的新功能开发编排

**提问示例：**
- "开始开发用户认证功能"
- "新增商品推荐模块"
- "创建订单管理功能"

**参数说明：**
- `feature_name`: 功能名称（必填）
- `description`: 功能描述（必填）
- `docs_dir`: 文档目录（可选）

**流程：** 检查上下文 → 生成规格 → 估算工作量

---

### 2. start_bugfix - Bug 修复流程
**用途：** 完整的 Bug 修复编排

**提问示例：**
- "修复这个 Bug：点击推荐按钮报错"
- "解决登录失败的问题"
- "处理这个错误：[粘贴错误信息]"

**参数说明：**
- `error_message`: 错误信息（必填）
- `stack_trace`: 堆栈跟踪（可选）

**流程：** 检查上下文 → 分析定位 → 修复方案 → 生成测试

---

### 3. start_review - 代码全面体检
**用途：** 代码审查 + 安全扫描 + 性能分析

**提问示例：**
- "全面审查这段代码：[粘贴代码]"
- "对这个文件做完整的代码体检"
- "综合分析这个模块的质量"

**参数说明：**
- `code`: 代码内容（必填）
- `language`: 编程语言（可选）

---

### 4. start_release - 发布准备流程
**用途：** 生成 Changelog + PR 描述

**提问示例：**
- "准备发布 v1.2.0"
- "生成这个版本的发布文档"
- "整理发布内容"

**参数说明：**
- `version`: 版本号（必填）
- `from_tag`: 起始 tag（可选）
- `branch`: 分支名称（可选）

---

### 5. start_refactor - 重构流程
**用途：** 审查现状 → 重构建议 → 生成测试

**提问示例：**
- "重构这段代码：[粘贴代码]"
- "优化这个模块的结构"
- "改进代码可读性"

**参数说明：**
- `code`: 代码内容（必填）
- `goal`: 重构目标（可选）

---

### 6. start_onboard - 快速上手流程
**用途：** 分析项目 → 生成上下文文档

**提问示例：**
- "帮我快速了解这个项目"
- "生成项目上手文档"
- "分析项目结构并生成说明"

**参数说明：**
- `project_path`: 项目路径（可选）
- `docs_dir`: 文档目录（可选）

---

### 7. start_api - API 开发流程
**用途：** 生成文档 → 生成 Mock → 生成测试

**提问示例：**
- "为这个 API 生成完整文档：[粘贴代码]"
- "开发这个接口的完整流程"
- "生成 API 文档和测试"

**参数说明：**
- `code`: API 代码（必填）
- `format`: markdown/openapi
- `language`: 编程语言（可选）

---

### 8. start_doc - 文档补全流程
**用途：** 注释 → README → API 文档

**提问示例：**
- "为这个项目补全所有文档"
- "生成完整的项目文档"
- "补充代码注释和说明"

**参数说明：**
- `code`: 代码或项目信息（必填）
- `lang`: zh/en
- `style`: jsdoc/tsdoc

---

## 🏗️ 项目管理工具

### 1. init_project - 初始化项目
**用途：** 创建项目结构和任务分解

**提问示例：**
- "初始化一个电商管理系统项目"
- "创建博客系统的项目结构"
- "搭建新项目框架"

**参数说明：**
- `project_name`: 项目名称（可选）
- `input`: 项目需求描述（可选）

---

### 2. init_project_context - 生成项目上下文
**用途：** 生成技术栈/架构/编码规范文档

**提问示例：**
- "生成项目上下文文档"
- "创建开发规范文档"
- "整理项目技术文档"

**参数说明：**
- `docs_dir`: 文档目录（可选）

---

### 3. add_feature - 添加功能规格
**用途：** 生成功能需求/设计/任务清单

**提问示例：**
- "添加用户权限管理功能"
- "新增商品评论模块"
- "创建数据导出功能"

**参数说明：**
- `feature_name`: 功能名称（必填）
- `description`: 功能描述（必填）
- `docs_dir`: 文档目录（可选）

---

### 4. fix_bug - Bug 修复指导
**用途：** 根因分析 + 修复方案 + 验证步骤

**提问示例：**
- "指导修复这个 Bug：[描述问题]"
- "提供 Bug 修复方案"
- "如何解决这个问题"

**参数说明：**
- `error_message`: 错误信息（必填）
- `stack_trace`: 堆栈跟踪（可选）
- `expected_behavior`: 期望行为（可选）
- `actual_behavior`: 实际行为（可选）

---

### 5. estimate - 工作量估算
**用途：** 估算开发时间和风险

**提问示例：**
- "估算这个功能的开发时间：[描述需求]"
- "评估工作量：实现用户登录模块"
- "这个任务需要多久"

**参数说明：**
- `task_description`: 任务描述（必填）
- `code_context`: 相关代码（可选）
- `experience_level`: junior/mid/senior
- `team_size`: 团队规模（可选）

---

## 🛠️ 其他工具

### 1. detect_shell - 检测 AI 环境
**用途：** 识别是否为套壳产品

**提问示例：**
- "检测当前 AI 环境"
- "分析环境指纹"

**参数说明：**
- `nonce`: 随机字符串（可选）
- `skip_network`: 是否跳过网络探测（可选）

---

### 2. init_setting - 初始化 Cursor 配置
**用途：** 写入推荐的 AI 设置

**提问示例：**
- "初始化 Cursor 配置"
- "设置推荐的 AI 参数"

**参数说明：**
- `project_path`: 项目路径（可选）

---

### 3. css_order - CSS 属性排序
**用途：** 按规范重排 CSS 属性

**提问示例：**
- "整理这段 CSS 的属性顺序"
- "规范化 CSS 代码"

**无需参数**

---

### 4. gen_skill - 生成 Agent Skills 文档
**用途：** 为工具生成技能文档

**提问示例：**
- "生成所有工具的技能文档"
- "导出工具使用说明"

**参数说明：**
- `scope`: all/basic/generation/analysis（可选）
- `tool_name`: 指定工具名称（可选）
- `lang`: zh/en
- `output_dir`: 输出目录（可选）

---

## 💡 使用技巧

### 1. Interview 模式最佳实践 🆕

**何时使用 Interview 模式：**
- ✅ 需求描述简短、不明确
- ✅ 复杂的业务功能
- ✅ 涉及多方协作的功能
- ❌ 简单的 Bug 修复
- ❌ 需求非常明确的功能

**工作流程：**
```
方式1: 立即开发
1. interview "用户登录功能"
2. 回答 12-15 个问题
3. start_feature --from-interview user-login
4. 根据 tasks.md 开始编码

方式2: 分步进行
第1天: interview "用户登录功能" → 回答问题
第3天: start_feature --from-interview user-login → 开始开发
```

---

### 2. 组合使用
- 先用 `debug` 定位问题 → 再用 `fix` 自动修复
- 先用 `analyze_project` 了解项目 → 再用 `add_feature` 添加功能
- 先用 `code_review` 审查 → 再用 `refactor` 重构

### 3. 工作流优先
- 复杂任务优先使用 `start_*` 系列工具（自动编排多个步骤）
- 简单任务使用单个工具（更快更直接）

### 4. 提供完整信息
- 粘贴完整的错误堆栈（不要截断）
- 提供相关代码上下文（不要只给一行）
- 描述清楚期望结果

### 5. 善用可选参数
- 大多数工具会自动检测（如框架、语言）
- 只在需要明确指定时才传参数

---

**打印建议：** A4 纸双面打印，建议缩放至 85% 以适应页面
