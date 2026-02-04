<div align="center">
  <img src="docs/assets/logo.png" alt="MCP Probe Kit Logo" width="200"/>
  <h1>知时MCP (MCP Probe Kit)</h1>
  <p><em>知其境，馈其时。</em></p>
</div>

**Languages**: [English](README.md) | [简体中文](i18n/README.zh-CN.md) | [日本語](i18n/README.ja-JP.md) | [한국어](i18n/README.ko-KR.md) | [Español](i18n/README.es-ES.md) | [Français](i18n/README.fr-FR.md) | [Deutsch](i18n/README.de-DE.md) | [Português (BR)](i18n/README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 AI-Powered Complete Development Toolkit - Covering the Entire Development Lifecycle

A powerful MCP (Model Context Protocol) server providing **21 tools** covering the complete workflow from product analysis to final release (Requirements → Design → Development → Quality → Release), all tools support **structured output**.

**🎉 v3.0 Major Update**: Streamlined tool count, focus on core competencies, eliminate choice paralysis, let AI do more native work

**Supports All MCP Clients**: Cursor, Claude Desktop, Cline, Continue, and more

**Protocol Version**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.25.3

---

## 📚 Complete Documentation

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Quick Start](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Setup in 5 minutes
- [All Tools](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Complete list of 21 tools
- [Best Practices](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Full development workflow guide
- [v3.0 Migration Guide](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Upgrade from v2.x to v3.0

---

## ✨ Core Features

### 📦 21 Tools

- **🔄 Workflow Orchestration** (6 tools) - One-click complex development workflows
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Code Analysis** (3 tools) - Code quality and refactoring
  - `code_review`, `fix_bug`, `refactor`
- **📝 Git Tools** (2 tools) - Git commits and work reports
  - `gencommit`, `git_work_report`
- **⚡ Code Generation** (1 tool) - Test generation
  - `gentest`
- **📦 Project Management** (7 tools) - Project initialization and requirements management
  - `init_project`, `init_project_context`, `add_feature`, `estimate`, `interview`, `ask_user`
- **🎨 UI/UX Tools** (3 tools) - Design systems and data synchronization
  - `ui_design_system`, `ui_search`, `sync_ui_data`

### 🎯 Structured Output

Core and orchestration tools support **structured output**, returning machine-readable JSON data, improving AI parsing accuracy, supporting tool chaining and state tracking.

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
- `start_bugfix` - Bug fixing (Analysis → Fix → Testing)
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
| Fix bug (complete flow) | `start_bugfix` | Auto-complete: analysis→fix→test |
| Only need bug analysis | `fix_bug` | Faster, only analyzes problem |
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
