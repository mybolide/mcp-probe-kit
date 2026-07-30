# 子任务：核心治理与编排

- [x] 1.1 建立 Delegated Plan Contract v2 — _需求: FR-2_
  - 证据块：`src/lib/delegated-plan-contract.ts`；Contract 单元测试与 `start_feature`、`start_bugfix` 回归测试通过。
  - 涉及文件：`src/lib/delegated-plan-contract.ts`、`src/tools/start_feature.ts`、`src/tools/start_bugfix.ts`。
- [x] 1.2 增加 `spec_layout=auto` 复杂度决策 — _需求: FR-2_
  - 证据块：简单需求选择 flat、复杂多阶段需求选择 parent-child、显式覆盖和已有 subspecs 场景均有测试。
  - 涉及文件：`src/lib/parent-child-spec.ts`、`src/tools/start_feature.ts`。
- [x] 1.3 将当前 v4 规格迁移为 parent-child — _需求: FR-1, FR-2_
  - 证据块：母规格、`spec-manifest.json`、四个子规格及 `check_spec` 校验结果。
  - 涉及文件：`docs/specs/mcp-v4/`。
- [ ] 2.1 定义统一 ToolDefinition 与 Registry — _需求: FR-7_
  - 证据块：工具名称、Schema、Annotation、Toolset、Handler 和协议策略由单一注册源生成。
  - 涉及文件：`src/server/tool-registry.ts`、现有 Schema 与 registry 文件。
- [ ] 2.2 从 Registry 生成 tools/list、dispatcher、manifest 与 Skill 路由 — _需求: FR-7_
  - 证据块：生成物一致性测试与 30 个现有工具快照无未审核差异。
  - 涉及文件：`src/server/tool-dispatcher.ts`、scripts、manifest。
- [ ] 2.3 拆分 Server 核心并收敛 `src/index.ts` — _需求: FR-1, FR-2, FR-7_
  - 证据块：启动、tools、resources、apps、tasks 各模块测试通过，`src/index.ts` 仅保留启动职责。
  - 涉及文件：`src/server/`、`src/resources/`、`src/index.ts`。
