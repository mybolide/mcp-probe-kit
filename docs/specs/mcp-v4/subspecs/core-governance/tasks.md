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
- [x] 2.1 定义统一 ToolDefinition 与 Registry — _需求: FR-7_
  - 证据块：`src/server/tool-catalog.ts` 统一 Toolset、Skill Route、Annotation、Task/Protocol Policy；`src/server/tool-registry.ts` 组合 Schema 与 Handler，并在加载时校验 33 个工具一一覆盖。
  - 涉及文件：`src/server/tool-definition.ts`、`src/server/tool-catalog.ts`、`src/server/tool-registry.ts`、`src/lib/tool-annotations.ts`、`src/lib/toolset-manager.ts`、`src/lib/task-defaults.ts`。
- [x] 2.2 从 Registry 生成 tools/list、dispatcher、manifest 与 Skill 路由 — _需求: FR-7_
  - 证据块：`src/index.ts` 已通过 Registry 生成 `tools/list` 并执行 Handler，原 30 分支 switch 已删除；Manifest/Skill/Toolset/Annotation 均由 Catalog 生成；逐工具 tools/list 等价测试通过。
  - 涉及文件：`src/index.ts`、`src/server/tool-manifest.ts`、`scripts/sync-tool-manifest.ts`、`tools-manifest.json`、`src/lib/mcp-tool-skill-registry.ts`。
- [x] 2.3 拆分 Server 核心并收敛 `src/index.ts` — _需求: FR-1, FR-2, FR-7_
  - 证据块：`src/index.ts` 从 1159 行收敛为 28 行，仅负责 stdio 启动；Server Factory、tools/Legacy Tasks、Resources、UI Apps、Graph Snapshot 与结果装饰均已模块化。真实 SDK Client 完成 initialize、30 个 tools/list、resources/list、probe://status 和 workflow tools/call 冒烟验证。
  - 涉及文件：`src/server/create-server.ts`、`src/server/register-tool-handlers.ts`、`src/server/result-decorator.ts`、`src/server/runtime-types.ts`、`src/resources/`、`src/index.ts`。
