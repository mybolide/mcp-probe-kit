# Agent Evals 与发布就绪 Tasks

## 任务列表

- [x] 1.1 建立 Agent Evals — _需求: FR-9_
  - 证据块：24 项确定性用例覆盖 9 类路由、完整参数与复杂需求入口、Plan 状态纪律、Converge 后置记忆、项目/共享记忆排序、失效记忆过滤和 6 个关键工具描述触发，全部通过。
  - 实现：新增 `src/evals/agent-evals.ts`、机器可读报告类型、单元测试和 `npm run eval:agents`；任一用例失败时命令返回非零退出码。
  - 验证：`npm run eval:agents` 输出 24 passed / 0 failed；五个类别均 passed。
- [x] 1.2 建立自动发布闸门 — _需求: FR-9_
  - 证据块：发布闸门串联静态检查、全量测试、生产构建、Legacy/Modern 生产冒烟、真实本地 Agent 调用、Agent Evals 和真实 npm tarball 安装；任一错误级检查失败即阻断。
  - 实现：新增 `src/release/release-readiness.ts`、`release-channel.ts`、Tag 校验脚本、`release:static` 与 `release:verify`；校验 Node 20、SDK 2.0.0 精确版本、旧 SDK 移除、33 工具、版本一致性、Changelog、RC 工作流与迁移材料。RC 固定发布到 `next`，稳定版才允许 `latest`；预发布不写正式 MCP Registry。
  - 验证：`npm run release:verify` exit 0；81 个测试文件/383 项通过，构建、双协议冒烟、24 项 Evals、本地 Agent 验收和 `mcp-probe-kit-4.0.0-rc.1.tgz` 临时安装调用全部通过。
- [x] 2.1 完成迁移与客户端矩阵 — _需求: FR-9_
  - 证据块：v3 → v4 迁移说明覆盖 Node 20、SDK v2、协议模式、Tasks 与 input_required 降级、Plan 状态、Converge 后置记忆、RC `next` 安装和回退；真实客户端未验证项全部保持 pending。
  - 实现：新增 `docs/migration-v3-to-v4.md` 与 `docs/pages/migration-v4.html`，文档首页和指南入口切换到 v4；Compatibility Matrix 分离 reference 自动结果和人工客户端状态。
  - 验证：发布静态检查确认迁移文件、Reference/人工矩阵和 pending 状态存在；未将 Cursor、Claude Code、VS Code Copilot、Cline、OpenCode 或 Inspector 伪报为通过。

## 完成证据

- `npm run eval:agents`
- `npm run release:verify`
- `npm run acceptance:agent`
- `npm run smoke:package`
- `docs/migration-v3-to-v4.md`
- 更新后的 `compatibility-matrix.md`
