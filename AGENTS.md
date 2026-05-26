<!-- mcp-probe:context begin — auto-generated; re-run init_project_context updates this block only -->
## MCP（必须先调）
需已配置 mcp-probe-kit。`start_*` 若返回 delegated plan，逐步执行完再结束。

- 新功能 → `start_feature`（会先搜记忆）
- Bug → `start_bugfix`（会先搜记忆）
- UI → `start_ui`（会先搜记忆）
- 不熟代码 / 影响面 → `code_insight`（context / impact / auto）
- 缺上下文 → `init_project_context`
- 提交 → `gencommit`

上下文：写代码前先读 [project-context](./docs/project-context.md)（链到 `docs/project-context/` 各文档）
图谱：大改前读 [latest](./docs/graph-insights/latest.md)；过期 `code_insight` mode=auto save_to_docs=true

记忆（需 MEMORY_QDRANT_URL 等已配置）：
- 检索：`start_feature` / `start_bugfix` / `start_ui` 会自动搜记忆；命中后用 `read_memory_asset` 读全文再动手
- Bug 修完验证通过后 → **必须** `memorize_asset` type=`bugfix` tags=`bugfix,root-cause`（现象+根因+改法）
- 功能/UI 有可复用产出 → `memorize_asset` type=`pattern`/`component`
<!-- mcp-probe:context end -->

# User custom section
