<div align="center">
  <img src="docs/assets/logo.png" alt="知时MCP Logo" width="160"/>
  <h1>知时MCP | mcp-probe-kit</h1>
  <p><strong>Know the Context, Feed the Moment.</strong></p>
  <p>
    <code>Introspection</code> · <code>Context Hydration</code> · <code>Delegated Orchestration</code>
  </p>
</div>

---

<!-- mcp-name: io.github.mybolide/mcp-probe-kit -->

> **Talk is cheap, show me the Context.**
> 
> mcp-probe-kit is a protocol-level toolkit designed for developers who want AI to truly understand their project's intent. It's not just a collection of 22 tools—it's a context-aware system that helps AI agents grasp what you're building.

**Languages**: [English](README.md) | [简体中文](i18n/README.zh-CN.md) | [日本語](i18n/README.ja-JP.md) | [한국어](i18n/README.ko-KR.md) | [Español](i18n/README.es-ES.md) | [Français](i18n/README.fr-FR.md) | [Deutsch](i18n/README.de-DE.md) | [Português (BR)](i18n/README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 AI-Powered Complete Development Toolkit - Covering the Entire Development Lifecycle

A powerful MCP (Model Context Protocol) server providing **22 tools** covering the complete workflow from product analysis to final release (Requirements → Design → Development → Quality → Release), all tools support **structured output**.

**🎉 v3.0 Major Update**: Streamlined tool count, focus on core competencies, eliminate choice paralysis, let AI do more native work

**Supports All MCP Clients**: Cursor, Claude Desktop, Cline, Continue, and more

**Protocol Version**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.27.1

---

## 📚 Complete Documentation

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Quick Start](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Setup in 5 minutes
- [All Tools](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Complete list of 22 tools
- [Best Practices](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Full development workflow guide
- [v3.0 Migration Guide](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Upgrade from v2.x to v3.0

---

## ✨ Core Features

### 📦 22 Tools

- **🔄 Workflow Orchestration** (6 tools) - One-click complex development workflows
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Code Analysis** (4 tools) - Code quality, refactoring, and graph insight
  - `code_review`, `code_insight`, `fix_bug`, `refactor`
- **📝 Git Tools** (2 tools) - Git commits and work reports
  - `gencommit`, `git_work_report`
- **⚡ Code Generation** (1 tool) - Test generation
  - `gentest`
- **📦 Project Management** (6 tools) - Project initialization and requirements management
  - `init_project`, `init_project_context`, `add_feature`, `estimate`, `interview`, `ask_user`
- **🎨 UI/UX Tools** (3 tools) - Design systems and data synchronization
  - `ui_design_system`, `ui_search`, `sync_ui_data`

### 🧠 Code Graph Bridge (GitNexus)

- `code_insight` bridges GitNexus by default for query/context/impact analysis
- The bridge launches `npx -y gitnexus@latest mcp` by default to reduce stale package risk
- `init_project_context` bootstraps baseline graph docs under `docs/graph-insights/`; if `docs/project-context.md` already exists, it preserves the old context docs and only backfills graph docs plus the index entry
- `start_feature` refreshes the GitNexus index and runs task-level `query/context/impact` narrowing before spec generation to reduce over-scoping
- `start_bugfix` refreshes the GitNexus index and runs task-level graph analysis before TBP RCA to constrain failure boundary and blast radius
- Older projects that already have `project-context.md` but no graph docs are bootstrapped automatically through the `init_project_context` step
- If GitNexus is unavailable, the server falls back automatically without breaking orchestration
- Real graph queries read the `.gitnexus` index; `docs/graph-insights/latest.md|json` are readable snapshots for humans and AI agents
- Graph snapshots are exposed as resources (`probe://graph/latest`, `probe://graph/history`, `probe://graph/latest.md`)
- Graph snapshots are also persisted to readable files in `.mcp-probe-kit/graph-snapshots` (customizable via `MCP_GRAPH_SNAPSHOT_DIR`)
- Tool responses include `_meta.graph` with snapshot URI and local JSON/Markdown file paths

### 🐛 TBP 8-Step RCA for Bug Workflows

- `start_bugfix` defaults to Toyota-style TBP 8-step root-cause analysis before repair
- `fix_bug` returns a structured TBP skeleton covering phenomenon, timeline, ruled-out paths, boundary, root cause, evidence, and repair plan
- This makes bug, regression, anomaly, and "why didn't it work" investigations follow analyze-first discipline instead of patching symptoms

### 🎯 Structured Output

Core and orchestration tools support **structured output**, returning machine-readable JSON data, improving AI parsing accuracy, supporting tool chaining and state tracking.

### ⏱️ Native Tasks, Progress, and Cancellation

- Built on MCP SDK native task support (`taskStore` + `taskMessageQueue`)
- Supports task lifecycle endpoints: `tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel`
- Advertises `capabilities.tasks.requests.tools.call` so clients can create tasks for `tools/call`
- Emits `notifications/progress` when client provides `_meta.progressToken`
- Handles request cancellation via `AbortSignal` and returns a clear cancellation error
- Long-running orchestration tools (`start_*`) and `sync_ui_data` support cooperative cancellation/progress callbacks

### 🔌 Extensions & UI Apps (Optional)

- Trace metadata passthrough: request `_meta.trace` is preserved in tool responses (`_meta.trace`)
- Optional extensions capability switch: enable with `MCP_ENABLE_EXTENSIONS_CAPABILITY=1`
- Optional MCP Apps resource output for UI tools: enable with `MCP_ENABLE_UI_APPS=1`
- UI tools can expose preview resources via `ui://...` and response `_meta.ui.resourceUri`

### 🧭 Delegated Orchestration Protocol

All `start_*` orchestration tools return an **execution plan** in `structuredContent.metadata.plan`.  
AI needs to **call tools step by step and persist files**, rather than the tool executing internally.

**Plan Schema (Core Fields)**:
```json
{
  "mode": "delegated",
  "steps": [
    {
      "id": "spec",
      "tool": "add_feature",
      "args": { "feature_name": "user-auth", "description": "User authentication feature" },
      "outputs": ["docs/specs/user-auth/requirements.md"]
    }
  ]
}
```

**Field Description**:
- `mode`: Fixed as `delegated`
- `steps`: Array of execution steps
- `tool`: Tool name (e.g. `add_feature`)
- `action`: Manual action description when no tool (e.g. `update_project_context`)
- `args`: Tool parameters
- `outputs`: Expected artifacts
- `when/dependsOn/note`: Optional conditions and notes

### 🧩 Structured Output Field Specification (Key Fields)

Both orchestration and atomic tools return `structuredContent`, common fields:
- `summary`: One-line summary
- `status`: Status (pending/success/failed/partial)
- `steps`: Execution steps (orchestration tools)
- `artifacts`: Artifact list (path + purpose)
- `metadata.plan`: Delegated execution plan (only start_*)
- `specArtifacts`: Specification artifacts (start_feature)
- `estimate`: Estimation results (start_feature / estimate)

### 🧠 Requirements Clarification Mode (Requirements Loop)

When requirements are unclear, use `requirements_mode=loop` in `start_feature / start_bugfix / start_ui`.  
This mode performs 1-2 rounds of structured clarification before entering spec/fix/UI execution.

**Example:**
```json
{
  "feature_name": "user-auth",
  "description": "User authentication feature",
  "requirements_mode": "loop",
  "loop_max_rounds": 2,
  "loop_question_budget": 5
}
```

### 🧩 Template System (Regular Model Friendly)

`add_feature` supports template profiles, default `auto` auto-selects: prefers `guided` when requirements are incomplete (includes detailed filling rules and checklists), selects `strict` when requirements are complete (more compact structure, suitable for high-capability models or archival scenarios).

**Example:**
```json
{
  "description": "Add user authentication feature",
  "template_profile": "auto"
}
```

**Applicable Tools**:
- `start_feature` passes `template_profile` to `add_feature`
- `start_bugfix` / `start_ui` also support `template_profile` for controlling guidance strength (auto/guided/strict)

**Template Profile Strategy**:
- `guided`: Less/incomplete requirements info, regular model priority
- `strict`: Requirements structured, prefer more compact guidance
- `auto`: Default recommendation, auto-selects guided/strict

### 🔄 Workflow Orchestration

6 intelligent orchestration tools that automatically combine multiple basic tools for one-click complex development workflows:
- `start_feature` - New feature development (Requirements → Design → Estimation)
- `start_bugfix` - Bug fixing (TBP 8-step RCA → Fix → Testing)
- `start_onboard` - Project onboarding (Generate project context docs)
- `start_ui` - UI development (Design system → Components → Code)
- `start_product` - Product design (PRD → Prototype → Design system → HTML)
- `start_ralph` - Ralph Loop (Iterative development until goal completion)

### 🚀 Product Design Workflow

`start_product` is a complete product design orchestration tool, from requirements to interactive prototype:

**Workflow:**
1. **Requirements Analysis** - Generate standard PRD (product overview, feature requirements, page list)
2. **Prototype Design** - Generate detailed prototype docs for each page
3. **Design System** - Generate design specifications based on product type
4. **HTML Prototype** - Generate interactive prototype viewable in browser
5. **Project Context** - Auto-update project documentation

**Structured Output Additions**:
- `start_product.structuredContent.artifacts`: Artifact list (PRD, prototypes, design system, etc.)
- `interview.structuredContent.mode`: `usage` / `questions` / `record`

### 🎨 UI/UX Pro Max

3 UI/UX tools with `start_ui` as the unified entry point:
- `start_ui` - One-click UI development (supports intelligent mode) (orchestration tool)
- `ui_design_system` - Intelligent design system generation
- `ui_search` - UI/UX data search (BM25 algorithm)
- `sync_ui_data` - Sync latest UI/UX data locally

**Note**: `start_ui` automatically calls `ui_design_system` and `ui_search`, you don't need to call them separately.

**Inspiration:**
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) - UI/UX design system philosophy
- [json-render](https://github.com/vercel-labs/json-render) - JSON template rendering engine

**Why use `sync_ui_data`?**

Our `start_ui` tool relies on a rich UI/UX database (colors, icons, charts, components, design patterns, etc.) to generate high-quality design systems and code. This data comes from npm package [uipro-cli](https://www.npmjs.com/package/uipro-cli), including:
- 🎨 Color schemes (mainstream brand colors, color palettes)
- 🔣 Icon libraries (React Icons, Heroicons, etc.)
- 📊 Chart components (Recharts, Chart.js, etc.)
- 🎯 Landing page templates (SaaS, e-commerce, government, etc.)
- 📐 Design specifications (spacing, fonts, shadows, etc.)

**Data Sync Strategy:**
1. **Embedded Data**: Synced at build time, works offline
2. **Cached Data**: Runtime updates to `~/.mcp-probe-kit/ui-ux-data/`
3. **Manual Sync**: Use `sync_ui_data` to force update latest data

This ensures `start_ui` can generate professional-grade UI code even offline.

### 🎤 Requirements Interview

2 interview tools to clarify requirements before development:
- `interview` - Structured requirements interview
- `ask_user` - AI proactive questioning

---

## 🧭 Tool Selection Guide

### When to use orchestration tools vs individual tools?

**Use orchestration tools (start_*) when:**
- ✅ Need complete workflow (multiple steps)
- ✅ Want to automate multiple tasks
- ✅ Need to generate multiple artifacts (docs, code, tests, etc.)

**Use individual tools when:**
- ✅ Only need specific functionality
- ✅ Already have project context docs
- ✅ Need more fine-grained control

### Common Scenario Selection

| Scenario | Recommended Tool | Reason |
|---------|-----------------|--------|
| Develop new feature (complete flow) | `start_feature` | Auto-complete: spec→estimation |
| Only need feature spec docs | `add_feature` | More lightweight, only generates docs |
| Fix bug (complete flow) | `start_bugfix` | Root-cause-first flow: TBP RCA → fix → test |
| Only need bug analysis | `fix_bug` | TBP 8-step RCA only, without full orchestration |
| Generate design system | `ui_design_system` | Directly generate design specs |
| Develop UI components | `start_ui` | Complete flow: design→components→code |
| Product design (requirements to prototype) | `start_product` | One-click: PRD→prototype→HTML |
| One-sentence requirement analysis | `init_project` | Generate complete project spec docs |
| Project onboarding docs | `init_project_context` | Generate tech stack/architecture/conventions |

---

## 🚀 Quick Start

### Method 1: Use directly with npx (Recommended)

No installation needed, use the latest version directly.

#### Cursor / Cline Configuration

**Config file location:**
- Windows: `%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- macOS: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Linux: `~/.config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

**Config content:**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["mcp-probe-kit@latest"]
    }
  }
}
```

#### Claude Desktop Configuration

**Config file location:**
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Config content:**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"]
    }
  }
}
```

### Method 2: Global Installation

```bash
npm install -g mcp-probe-kit
```

Use in config file:
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "mcp-probe-kit"
    }
  }
}
```

### Windows Notes for Graph Tools

Applies to `code_insight`, `start_feature`, `start_bugfix`, and `init_project_context`.

- The GitNexus bridge uses `npx -y gitnexus@latest mcp` by default.
- On Windows, the first cold start can take 20+ seconds because `npx` may check/download packages.
- Some GitNexus dependencies use `tree-sitter-*` native modules. If your machine lacks Visual Studio Build Tools, the first install may fail with errors like `gyp ERR! find VS could not find a version of Visual Studio 2017 or newer to use`.

Recommended on Windows:

1. Install Visual Studio Build Tools with the C++ workload if you use graph-aware tools regularly.
2. Prefer stable local/global CLI usage for GitNexus when your MCP client supports `env`.
3. Increase GitNexus connect/call timeouts on slower or first-run environments.

Quick install command (Windows):

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

Example config using a preinstalled `gitnexus` CLI:

```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "mcp-probe-kit",
      "env": {
        "MCP_GITNEXUS_COMMAND": "gitnexus",
        "MCP_GITNEXUS_ARGS": "mcp",
        "MCP_GITNEXUS_CONNECT_TIMEOUT_MS": "30000",
        "MCP_GITNEXUS_TIMEOUT_MS": "45000"
      }
    }
  }
}
```

### Restart Client

After configuration, **completely quit and reopen** your MCP client.

**👉 [Detailed Installation Guide](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html)**

---

## 💡 Usage Examples

### Daily Development
```bash
code_review @feature.ts    # Code review
gentest @feature.ts         # Generate tests
gencommit                   # Generate commit message
```

### New Feature Development
```bash
start_feature user-auth "User authentication feature"
# Auto-complete: Requirements analysis → Design → Effort estimation
```

### Bug Fixing
```bash
start_bugfix
# Then paste error message
# Auto-complete: Problem location → Fix solution → Test code
```

### Product Design
```bash
start_product "Online Education Platform" --product_type=SaaS
# Auto-complete: PRD → Prototype → Design system → HTML prototype
```

### UI Development
```bash
start_ui "Login Page" --mode=auto
# Auto-complete: Design system → Component generation → Code output
```

### Project Context Documentation
```bash
# Single file mode (default) - Generate a complete project-context.md
init_project_context

# Modular mode - Generate 6 category docs (suitable for large projects)
init_project_context --mode=modular
# Generates: project-context.md (index) + 5 category docs
```

### Git Work Report
```bash
# Generate daily report
git_work_report --date 2026-02-03

# Generate weekly report
git_work_report --start_date 2026-02-01 --end_date 2026-02-07

# Save to file
git_work_report --date 2026-02-03 --output_file daily-report.md
# Auto-analyze Git diff, generate concise professional report
# If direct command fails, auto-provides temp script solution (auto-deletes after execution)
```

**👉 [More Usage Examples](https://mcp-probe-kit.bytezonex.com/pages/examples.html)**

---

## ❓ FAQ

### Q1: Tool not working or errors?

Check detailed logs:

**Windows (PowerShell):**
```powershell
npx -y mcp-probe-kit@latest 2>&1 | Tee-Object -FilePath .\mcp-probe-kit.log
```

**macOS/Linux:**
```bash
npx -y mcp-probe-kit@latest 2>&1 | tee ./mcp-probe-kit.log
```

### Q2: Client not recognizing tools after configuration?

1. **Restart client** (completely quit then reopen)
2. Check config file path is correct
3. Confirm JSON format is correct, no syntax errors
4. Check client developer tools or logs for error messages

### Q3: How to update to latest version?

**npx method (Recommended):**
Use `@latest` tag in config, automatically uses latest version.

**Global installation method:**
```bash
npm update -g mcp-probe-kit
```

### Q4: Why are graph-aware tools slow or timing out on Windows the first time?

This usually affects `code_insight`, `start_feature`, `start_bugfix`, and `init_project_context`.

Common causes:

1. `npx -y gitnexus@latest mcp` performs a cold start and may spend 20+ seconds checking/downloading packages.
2. GitNexus may need native `tree-sitter-*` modules, which can require Visual Studio Build Tools on Windows.

If you see logs like:

```text
gyp ERR! find VS could not find a version of Visual Studio 2017 or newer to use
gyp ERR! find VS - missing any VC++ toolset
```

Try this:

1. Install Visual Studio Build Tools with the C++ workload.
2. Retry once after dependencies finish installing.
3. If your client supports `env`, switch the bridge to a preinstalled `gitnexus` CLI and raise:
   `MCP_GITNEXUS_CONNECT_TIMEOUT_MS`
   `MCP_GITNEXUS_TIMEOUT_MS`

**👉 [More FAQ](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html)**

---

## 🤝 Contributing

Issues and Pull Requests welcome!

**Improvement suggestions:**
- Add useful tools
- Optimize existing tool prompts
- Improve documentation and examples
- Fix bugs

---

## 📄 License

MIT License

---

## 🔗 Related Links

- **Author**: [Kyle (小墨)](https://www.bytezonex.com/)
- **GitHub**: [mcp-probe-kit](https://github.com/mybolide/mcp-probe-kit)
- **npm**: [mcp-probe-kit](https://www.npmjs.com/package/mcp-probe-kit)
- **Documentation**: [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)

**Related Projects:**
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) - Official MCP protocol docs
- [GitHub Spec-Kit](https://github.com/github/spec-kit) - GitHub spec-driven development toolkit
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) - UI/UX design system philosophy source
- [json-render](https://github.com/vercel-labs/json-render) - JSON template rendering engine inspiration
- [uipro-cli](https://www.npmjs.com/package/uipro-cli) - UI/UX data source

---

**Made with ❤️ for AI-Powered Development**
