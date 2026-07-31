# Agent Evals 与发布就绪 Tasks

## 任务列表

- [x] 1.1 建立 Agent Evals — _需求: FR-9_
  - 证据块：24 项确定性用例覆盖 9 类路由、完整参数与复杂需求入口、Plan 状态纪律、Converge 后置记忆、项目/共享记忆排序、失效记忆过滤和 6 个关键工具描述触发，全部通过。
  - 实现：新增 `src/evals/agent-evals.ts`、机器可读报告类型、单元测试和 `npm run eval:agents`；任一用例失败时命令返回非零退出码。
  - 验证：`npm run eval:agents` 输出 24 passed / 0 failed；五个类别均 passed。
- [x] 1.2 建立自动发布闸门 — _需求: FR-9_
  - 证据块：发布闸门串联静态检查、全量测试、生产构建、Legacy/Modern 生产冒烟、真实本地 Agent 调用、稳定性循环、Agent Evals、真实 npm tarball 安装、v3.7.0 回退、MCP Inspector 和生产依赖审计；任一错误级检查失败即阻断。
  - 实现：新增 `src/release/release-readiness.ts`、`release-channel.ts`、Tag 校验、稳定性/回退/Inspector 脚本、`release:static` 与 `release:verify`；Node 20 执行完整闸门，Node 22 保持回归。RC 固定发布到 `next`，稳定版才允许 `latest`；预发布不写正式 MCP Registry。
  - 验证：Node 20.20.2 下 81 个测试文件/383 项、双协议、Agent 验收和稳定性循环通过；稳定性循环 16 个场景、81 次 Workflow 调用、0 失败；tarball 安装、v3.7.0 回退、Inspector 2.0.0 和生产依赖 0 漏洞均通过。
- [x] 2.1 完成迁移与客户端矩阵 — _需求: FR-9_
  - 证据块：v3 → v4 迁移说明覆盖 Node 20、SDK v2、协议模式、Tasks 与 input_required 降级、Plan 状态、Converge 后置记忆、RC `next` 安装和回退；真实客户端按具名版本和实际证据区分 passed、pending 与 blocked。
  - 实现：新增 `docs/migration-v3-to-v4.md` 与 `docs/pages/migration-v4.html`，文档首页和指南入口切换到 v4；Compatibility Matrix 分离 reference 自动结果和人工客户端状态。
  - 验证：MCP Inspector 2.0.0 与 Claude Code 2.1.179 均在真实宿主调用通过后标记 passed；Cursor 3.0.16、VS Code 1.104.1 / Copilot Chat 0.31.5、未安装的 Cline 和 OpenCode 1.17.11 均按实际阻断原因记录为 blocked，未把连接成功或客户端缺失伪报为完整验收。
- [x] 2.2 建立稳定 RC 资格与回退规则 — _需求: FR-9_
  - 证据块：`docs/rc-stability-policy.md` 明确定义 Node 20/22、0 失败稳定性循环、安全审计、干净安装、真实 Inspector、v3.7.0 回退和发布后观察窗口。
  - 实现：新增 Node 20/22 CI、`stability:soak`、`smoke:rollback`、`smoke:inspector` 与 `security:audit`；全部进入 `release:verify`。
  - 验证：本机 Node 22 与实际 Node 20.20.2 均通过；MCP Inspector 2.0.0 实机发现 33 个工具；Claude Code 2.1.179 完成真实工具与 Plan 生命周期调用；其余未完成宿主保持 pending 或 blocked。

## 完成证据

- `npm run eval:agents`
- `npm run release:verify`
- `npm run acceptance:agent`
- `npm run smoke:package`
- `npm run stability:soak`
- `npm run smoke:rollback`
- `npm run smoke:inspector`
- `npm run security:audit`
- `docs/rc-stability-policy.md`
- `docs/migration-v3-to-v4.md`
- 更新后的 `compatibility-matrix.md`
- `docs/specs/mcp-v4/host-compatibility-evidence-2026-07-31.md`
