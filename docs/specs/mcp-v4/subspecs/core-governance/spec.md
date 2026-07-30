# 子规格：核心治理与编排

## 范围

统一 Canonical Skill、Tool Registry、Delegated Plan Contract、复杂度布局决策和 Server 核心解耦，使不同 Agent 获得一致的工具路由与研发执行合同。

## 需求回链

- FR-1
- FR-2
- FR-7

## 验收标准（EARS）

1. WHEN Agent 面对新功能或增强需求 THEN 系统 SHALL 通过 canonical Skill 路由到 `start_feature`，而不是让 Agent绕过 MCP 直接实施。
2. WHEN `start_feature` 接收简单局部需求 THEN 系统 SHALL 在 `auto` 模式选择 flat，并在 metadata 中返回决策依据。
3. WHEN `start_feature` 接收复杂多模块或多阶段需求 THEN 系统 SHALL 自动选择 parent-child；缺少子规格定义时 SHALL 先返回 `decompose-spec` 步骤。
4. WHEN 旧客户端读取计划 THEN 系统 SHALL 保留 `mode: delegated` 与 `steps`；新字段不得破坏 v3 读取路径。
5. WHEN 新增或修改工具 THEN Tool Registry SHALL 成为 Schema、Annotation、Toolset、Handler、manifest 和 Skill 路由的统一事实来源。

## 涉及文件

- `src/lib/parent-child-spec.ts`
- `src/lib/delegated-plan-contract.ts`
- `src/lib/mcp-tool-skill-registry.ts`
- `src/lib/toolset-manager.ts`
- `src/tools/start_feature.ts`
- `src/server/`
- `src/index.ts`

## 不做项

- 本子规格不实现 Qdrant 记忆数据模型升级。
- 本子规格不实现 Legacy / Modern wire protocol。

## 设计要点

- `start_feature` 默认 `spec_layout=auto`，显式值具有最高优先级。
- `add_feature` 继续保持显式 flat / parent-child，避免原子工具过度推断。
- Plan Contract 只约束和描述执行，Agent 仍负责真实文件、代码和命令操作。
- Tool Registry 迁移必须保持全部现有工具输入输出兼容。
