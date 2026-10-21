/** Guidance for Git + Node22 projects running DevControl SQLite. */
export const DEVCONTROL_AGENT_GUIDANCE = [
  "## Git + Node22 + DevControl: Agent 主导业务，MCP 只负责流程",
  "",
  "仅适用于当前 Git/Node22 项目已启用 DevControl SQLite；非 Git、旧 Node 和显式 legacy files 项目沿用既有工作流。start_feature / start_bugfix 仅返回委托模板，不规划业务、不决定方案、不自动发现真实需求。",
  "",
  "1. 新对话先 history_session_bootstrap；用户说继续先 resume_plan，然后 devcontrol next / execution-contract 查已冻结任务、历史、依赖和 Git 状态。不要重新初始化丢失进度。",
  "2. Agent 读用户目标、PRD、ADR、代码、原始需求和真实证据，独立做技术决策及整版规划；每个 WorkItem 只做一件可独立验收的事，有 ID、需求追踪、明确的成功/失败、依赖、文件范围和 Gate。禁止虚构 Owner、测试、日期、满意度或为了凑任务数拆碎。",
  "3. start_feature 返回模板后，由 Agent 用 feature-save 维护 SQLite requirements/design/tasks，feature-validate 校验。完成当前完整版本 ReleaseWorkPlan 后，Agent 必须从原始材料独立 Review：正常、失败/恢复、跨组件、安全隐私、测试发布。release-work-review 只做结构预检，release-work-stage 保存待审；只有明确整版授权及精确 SHA256 才可 release-work-approve。",
  "4. SQLite 是 DevControl Feature、原子工作项与验收的唯一来源。默认不生成 docs/specs/<feature>/、tasks.md 或复杂父子任务树；只有显式 legacy files 模式例外。Feature specified、结构 review passed、release frozen 都不代表产品代码或发布 Gate 已通过。",
  "5. 一次只执行一个任务：devcontrol next → execution-contract → claim；必要时 renew。实现并运行真实测试，devcontrol check → 正常 Git Hook 提交 → complete（实施/真实测试/遗留/Git SHA）→ report（证据）→ verify。依赖没通过不能跳步；未跑的 iPhone、Go HTTP、权限、备份恢复和真实用户反馈保持 Not Run。",
  "6. 每轮完成前 history_session_checkpoint；检查保存与工作台 SQLite 是否一致。仅在项目 Owner 已明确同意共享数据库时按该项目 export/verify/restore 流程提交事务一致的 SQLite Git 快照；不得直接复制正在写的 WAL 主库或暴露私人 History / 活跃租约。首次 clone 且没有本地数据库时才允许 restore，不覆盖现有工作。",
  "",
  "责任边界：MCP 提供模板、状态记录、通用结构检查、审批哈希、租约和 Gate；业务规划、独立 Review、技术方案选择、真实测试与最终交付由 Agent 负责。",
].join("\n");
