<div align="center">
<img src="../docs/assets/logo.png" alt="知时MCP Logo" width="160"/>
<h1>知时MCP | mcp-probe-kit</h1>
<p><strong>Kenne den Kontext, Füttere den Moment.</strong></p>
<p><code>Introspection</code> · <code>Context Hydration</code> · <code>Delegated Orchestration</code></p>
</div>

---

**Talk is cheap, show me the Context.**

> Zhishi MCP ist ein Protokoll-Level-Sondierungs- und Kontextversorgungstoolkit, das für Geeks entwickelt wurde. Es ist nicht nur eine Sammlung von 21 Tools, sondern ein Wahrnehmungssystem, das es der KI ermöglicht, die Absicht Ihres Projekts wirklich zu "verstehen".

**Sprachen**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Español](README.es-ES.md) | [Français](README.fr-FR.md) | **Deutsch** | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 KI-gestütztes Vollständiges Entwicklungs-Toolkit - Abdeckung des Gesamten Entwicklungslebenszyklus

Ein leistungsstarker MCP (Model Context Protocol) Server, der **21 Tools** bereitstellt, die den kompletten Workflow von der Produktanalyse bis zur finalen Veröffentlichung abdecken (Anforderungen → Design → Entwicklung → Qualität → Release), alle Tools unterstützen **strukturierte Ausgabe**.

**🎉 v3.0 Großes Update**: Vereinfachte Tool-Anzahl, Fokus auf Kernkompetenzen, Beseitigung von Entscheidungslähmung, ermöglicht der KI mehr native Arbeit

**Unterstützt Alle MCP-Clients**: Cursor, Claude Desktop, Cline, Continue und mehr

**Protokollversion**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.27.1

---

## 📚 Vollständige Dokumentation

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Schnellstart](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Einrichtung in 5 Minuten
- [Alle Tools](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Vollständige Liste von 21 Tools
- [Best Practices](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Vollständiger Entwicklungs-Workflow-Leitfaden
- [v3.0 Migrationsleitfaden](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Upgrade von v2.x auf v3.0

---

## ✨ Kernfunktionen

### 📦 21 Tools

- **🔄 Workflow-Orchestrierung** (6 Tools) - Komplexe Entwicklungs-Workflows mit einem Klick
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Code-Analyse** (3 Tools) - Code-Qualität und Refactoring
  - `code_review`, `fix_bug`, `refactor`
- **📝 Git-Tools** (2 Tools) - Git-Commits und Arbeitsberichte
  - `gencommit`, `git_work_report`
- **⚡ Code-Generierung** (1 Tool) - Test-Generierung
  - `gentest`
- **📦 Projektmanagement** (7 Tools) - Projektinitialisierung und Anforderungsmanagement
  - `init_project`, `init_project_context`, `add_feature`, `estimate`, `interview`, `ask_user`
- **🎨 UI/UX-Tools** (3 Tools) - Design-Systeme und Datensynchronisation
  - `ui_design_system`, `ui_search`, `sync_ui_data`

Für weitere Details zu Funktionen, Installation und Verwendung lesen Sie bitte die [vollständige englische Dokumentation](../README.md) oder besuchen Sie [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/).

---

## 🚀 Schnellinstallation

### Methode 1: Direkte Verwendung mit npx (Empfohlen)

**Cursor / Cline Konfiguration:**
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

**Claude Desktop Konfiguration:**
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

### Methode 2: Globale Installation

```bash
npm install -g mcp-probe-kit
```

### Windows-Hinweis für Graph-Tools

Gilt für `code_insight`, `start_feature`, `start_bugfix` und `init_project_context`.

- Die GitNexus-Bridge verwendet standardmäßig `npx -y gitnexus@latest mcp`.
- Unter Windows kann der erste Kaltstart mehr als 20 Sekunden dauern.
- Einige GitNexus-Abhängigkeiten verwenden native `tree-sitter-*`-Module und können Visual Studio Build Tools benötigen.

Empfehlungen unter Windows:

1. Installiere Visual Studio Build Tools mit C++-Workload.
2. Wenn dein MCP-Client `env` unterstützt, verwende bevorzugt eine vorinstallierte `gitnexus` CLI.
3. Erhöhe in langsamen Umgebungen die GitNexus-Connect/Call-Timeouts.

Schnellinstallation (Windows):

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

---

## 💡 Verwendungsbeispiele

```bash
# Tägliche Entwicklung
code_review @feature.ts
gentest @feature.ts
gencommit

# Entwicklung neuer Funktionen
start_feature user-auth "Benutzerauthentifizierungsfunktion"

# Fehlerbehebung
start_bugfix

# Produktdesign
start_product "Online-Bildungsplattform" --product_type=SaaS

# UI-Entwicklung
start_ui "Anmeldeseite" --mode=auto
```

---

## 🤝 Beitragen

Issues und Pull Requests sind willkommen!

---

## 📄 Lizenz

MIT License

---

## 🔗 Links

- **Autor**: [Kyle (小墨)](https://www.bytezonex.com/)
- **GitHub**: [mcp-probe-kit](https://github.com/mybolide/mcp-probe-kit)
- **npm**: [mcp-probe-kit](https://www.npmjs.com/package/mcp-probe-kit)
- **Dokumentation**: [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)

---

**Made with ❤️ for AI-Powered Development**
