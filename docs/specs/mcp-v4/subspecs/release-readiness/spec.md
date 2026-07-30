# 子规格：Agent Evals 与发布就绪

## 范围

为 MCP Probe Kit v4 建立可重复执行的 Agent 行为评估、自动发布闸门、迁移说明和客户端兼容状态记录，确保“规范、统一、高效”不是仅靠文案声明。

## 需求回链

- FR-9

## 验收标准（EARS）

1. WHEN 运行 Agent Evals THEN 系统 SHALL 验证路由、参数构造、Plan Compliance、Memory 污染防护和工具描述触发，且输出机器可读结果。
2. WHEN Agent 收到完整复杂需求 THEN 路由 SHALL 选择 `start_feature` 并提示 `spec_layout=auto`，不得选择 `add_feature` 作为首入口。
3. WHEN Plan 包含长期记忆沉淀 THEN 计划 SHALL 先准备候选并通过 `converge`，不得在收敛前调用 `memorize_asset`。
4. WHEN 运行发布闸门 THEN 系统 SHALL 串联全量测试、生产构建、双协议生产冒烟、Agent Evals 与 npm 包清单检查。
5. WHEN 客户端尚未实机验证 THEN 兼容矩阵 SHALL 标记为 pending，并保留验证日期、版本和证据字段。
6. WHEN 用户从 v3 升级 THEN 迁移说明 SHALL 明确 Node 20、SDK v2、协议模式、Tasks 降级、Plan 状态和 Memory 顺序。
7. WHEN 判断 RC 是否稳定可发布 THEN 系统 SHALL 在 Node 20/22 上验证，并执行真实进程冷启动、连续调用、并发、Memory 故障降级和协议拒绝，且失败数为 0。
8. WHEN 准备 RC 回退方案 THEN 系统 SHALL 验证固定 v3.7.0 包仍能安装、完成 Legacy 握手并发现核心工具。
9. WHEN 宣称至少一个真实宿主已验证 THEN 系统 SHALL 使用固定版本 MCP Inspector 连接生产构建，并记录版本、日期和可重复证据。

## 涉及文件

- `src/evals/`
- `scripts/run-agent-evals.ts`
- `scripts/verify-release-readiness.ts`
- `scripts/stability-soak.mjs`
- `scripts/rollback-smoke.mjs`
- `scripts/inspector-smoke.mjs`
- `docs/migration-v3-to-v4.md`
- `docs/rc-stability-policy.md`
- `docs/specs/mcp-v4/compatibility-matrix.md`
- `package.json`

## 不做项

- 不在自动测试中伪造 Cursor、Claude Code、VS Code Copilot 等真实客户端结果。
- 不因发布闸门存在就自动执行 npm publish、创建 Git Tag 或发布 GitHub Release。
- 不把 Modern Tasks Extension 从同步降级直接改成默认启用。

## 设计要点

- Evals 使用确定性输入与硬断言，输出 JSON 摘要。
- 发布闸门失败时必须返回非零退出码，并指出失败阶段。
- 人工客户端矩阵与 reference client 自动测试分开记录。
- 自动化通过是发布候选的必要条件，不是替代人工客户端验收的充分条件。
- RC 可在未完成全部宿主认证时发布到 `next`，但稳定版 `4.0.0` 必须经过发布后观察和目标宿主实机验证。
