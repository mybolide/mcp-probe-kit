# mcp-probe-kit — Kenne den Kontext, Füttere den Moment

<div align="center">
  <img src="../docs/assets/logo.png" alt="知时MCP Logo" width="160"/>
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
> mcp-probe-kit ist ein Protokoll-Level-Toolkit für Entwickler, die wollen, dass KI die Absicht ihres Projekts wirklich versteht. Es ist nicht nur eine Sammlung von 29 Tools – es ist ein kontextbewusstes System, das KI-Agenten hilft zu erfassen, was Sie bauen.

**Sprachen**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Español](README.es-ES.md) | [Français](README.fr-FR.md) | **Deutsch** | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 KI-gestütztes Vollständiges Entwicklungs-Toolkit – Abdeckung des gesamten Entwicklungslebenszyklus

Ein leistungsstarker MCP (Model Context Protocol) Server mit **29 Tools**, die den kompletten Workflow von der Produktanalyse bis zur Veröffentlichung abdecken (Anforderungen → Design → Entwicklung → Qualität → Release), alle Tools unterstützen **strukturierte Ausgabe**.

**🎉 v3.0 Großes Update**: Vereinfachte Tool-Anzahl, Fokus auf Kernkompetenzen, Beseitigung von Entscheidungslähmung, mehr native Arbeit für KI

**Unterstützt alle MCP-Clients**: Cursor, Claude Desktop, Cline, Continue und mehr

**Protokollversion**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.27.1

---

## 📚 Vollständige Dokumentation

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Schnellstart](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Einrichtung in 5 Minuten
- [Alle Tools](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Vollständige Liste von 29 Tools
- [Best Practices](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Vollständiger Entwicklungs-Workflow-Leitfaden
- [v3.0 Migrationsleitfaden](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Upgrade von v2.x auf v3.0

---

## ✨ Kernfunktionen

### 📦 29 Tools

- **🔄 Workflow-Orchestrierung** (6 Tools) - Komplexe Entwicklungs-Workflows mit einem Klick
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Code-Analyse** (4 Tools) - Code-Qualität, Refactoring und Graph-Insight
  - `code_review`, `code_insight`, `fix_bug`, `refactor`
- **📝 Git-Tools** (2 Tools) - Git-Commits und Arbeitsberichte
  - `gencommit`, `git_work_report`
- **⚡ Code-Generierung** (1 Tool) - Test-Generierung
  - `gentest`
- **📦 Projektmanagement** (7 Tools) - Projektinitialisierung, Anforderungen und Spec-Validierung
  - `init_project`, `init_project_context`, `add_feature`, `check_spec`, `estimate`, `interview`, `ask_user`
- **🎨 UI/UX-Dienstprogramme** (3 Tools) - Design-Systeme und UI-Datensynchronisation
  - `ui_design_system`, `ui_search`, `sync_ui_data`
- **🧠 Memory** (6 Tools) - Wiederverwendbare Asset-Memory
  - `search_memory`, `read_memory_asset`, `memorize_asset`, `update_memory_asset`, `delete_memory_asset`, `scan_and_extract_patterns`

### 🧠 Code-Graph-Bridge (GitNexus)

- `code_insight` verbindet GitNexus standardmäßig für Query/Context/Impact-Analysen
- Die Bridge startet `npx -y gitnexus@latest mcp` standardmäßig, um veraltete Pakete zu vermeiden
- `init_project_context` erzeugt Baseline-Graph-Dokumente unter `docs/graph-insights/`
- `start_feature` und `start_bugfix` aktualisieren den GitNexus-Index
- Wenn GitNexus nicht verfügbar ist, fällt der Server automatisch zurück
- Graph-Snapshots werden als Ressourcen bereitgestellt (`probe://graph/latest`, etc.)
- Snapshots werden in `.mcp-probe-kit/graph-snapshots` persistiert

### 🐛 TBP 8-Schritte-RCA für Bug-Workflows

- `start_bugfix` verwendet standardmäßig Toyota-orientierte TBP 8-Schritte-Root-Cause-Analysis
- `fix_bug` liefert strukturiertes TBP-Skelett mit Phänomen, Timeline, ausgeschlossenen Pfaden, Grenze, Ursache, Beweisen und Reparaturplan

### 🧠 Memory Retrieval

- Memory-Tools nutzen **Qdrant** als Vektor-Datenbank-Backend
- Embedding-Dienst unterstützt: `ollama` und `openai-compatible`

**Memory-Tools:**
- `search_memory` - Semantische Suche im gemeinsamen Memory-Pool
- `memorize_asset` - Wiederverwendbare Assets in Vektor-Memory persistieren
- `read_memory_asset` - Asset-Inhalt per `asset_id` lesen
- `update_memory_asset` - Bestehendes Asset per `asset_id` aktualisieren (ID bleibt erhalten)
- `delete_memory_asset` - Asset per `asset_id` aus dem Pool löschen
- `scan_and_extract_patterns` - Wiederverwendbare Patterns extrahieren

**Empfohlenes lokales Memory-Setup (Qdrant + Ollama):**
```bash
docker run -d --name mcp-qdrant -p 6333:6333 qdrant/qdrant
ollama pull nomic-embed-text
```

```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"],
      "env": {
        "MEMORY_QDRANT_URL": "http://127.0.0.1:6333",
        "MEMORY_QDRANT_COLLECTION": "mcp_probe_memory",
        "MEMORY_EMBEDDING_PROVIDER": "ollama",
        "MEMORY_EMBEDDING_URL": "http://127.0.0.1:11434/api/embeddings",
        "MEMORY_EMBEDDING_MODEL": "nomic-embed-text",
        "MEMORY_SEARCH_LIMIT": "3",
        "MEMORY_SUMMARY_MAX_CHARS": "280"
      }
    }
  }
}
```

**OpenAI-kompatibles Embedding-Setup:**
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"],
      "env": {
        "MEMORY_QDRANT_URL": "http://127.0.0.1:6333",
        "MEMORY_QDRANT_COLLECTION": "mcp_probe_memory",
        "MEMORY_EMBEDDING_PROVIDER": "openai-compatible",
        "MEMORY_EMBEDDING_URL": "https://your-embedding-endpoint/v1/embeddings",
        "MEMORY_EMBEDDING_API_KEY": "your-api-key",
        "MEMORY_EMBEDDING_MODEL": "text-embedding-3-small"
      }
    }
  }
}
```

### 🎯 Strukturierte Ausgabe

Kern- und Orchestrierungswerkzeuge unterstützen **strukturierte Ausgabe** mit maschinenlesbaren JSON-Daten.

### ⏱️ Native Tasks, Fortschritt und Abbruch

- Basiert auf MCP SDK nativer Task-Unterstützung (`taskStore` + `taskMessageQueue`)
- Unterstützt Task-Lifecycle-Endpoints: `tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel`
- Deklariert `capabilities.tasks.requests.tools.call`
- Sendet `notifications/progress` bei `_meta.progressToken`
- Behandelt Abbruch via `AbortSignal`
- Langlaufende Tools (`start_*`) und `sync_ui_data` unterstützen kooperativen Abbruch

### 🔌 Erweiterungen & UI Apps (Optional)

- Trace-Metadaten-Durchreichung: `_meta.trace` in Tool-Antworten erhalten
- Erweiterungsfähigkeits-Schalter: `MCP_ENABLE_EXTENSIONS_CAPABILITY=1`
- UI Apps Ressourcenausgabe: `MCP_ENABLE_UI_APPS=1`
- UI-Tools setzen Ressourcen über `ui://...` und `_meta.ui.resourceUri` aus

### 🧭 Delegiertes Orchestrierungsprotokoll

Alle `start_*` Orchestrierungstools geben einen **Ausführungsplan** in `structuredContent.metadata.plan` zurück. Die KI muss **Tools schrittweise aufrufen und Dateien persistieren**.

**Plan-Schema:**
```json
{
  "mode": "delegated",
  "steps": [
    {
      "id": "spec",
      "tool": "add_feature",
      "args": { "feature_name": "user-auth", "description": "Benutzerauthentifizierung" },
      "outputs": ["docs/specs/user-auth/requirements.md"]
    }
  ]
}
```

### 🧩 Strukturierte Ausgabe Feldspezifikation

- `summary` : Einzeilige Zusammenfassung
- `status` : Status (pending/success/failed/partial)
- `steps` : Ausführungsschritte (Orchestrierungstools)
- `artifacts` : Artefaktliste
- `metadata.plan` : Delegierter Ausführungsplan (nur start_*)
- `specArtifacts` : Spezifikationsartefakte (start_feature)
- `estimate` : Schätzungsergebnisse (start_feature / estimate)

### 🧠 Anforderungsklärungsmodus (Requirements Loop)

Verwenden Sie `requirements_mode=loop` in `start_feature / start_bugfix / start_ui` für 1-2 Runden strukturierter Klärung.

```json
{
  "feature_name": "user-auth",
  "description": "Benutzerauthentifizierungsfunktion",
  "requirements_mode": "loop",
  "loop_max_rounds": 2,
  "loop_question_budget": 5
}
```

### 🧩 Template-System

`add_feature` unterstützt Template-Profile: `guided` (unvollständige Anforderungen), `strict` (vollständig), `auto` (automatische Auswahl).

```json
{
  "description": "Benutzerauthentifizierung hinzufügen",
  "template_profile": "auto"
}
```

### 🔄 Workflow-Orchestrierung

6 intelligente Orchestrierungstools:
- `start_feature` - Neue Funktion (Anforderungen → Design → Schätzung)
- `start_bugfix` - Bugfix (TBP 8-Schritte RCA → Fix → Tests)
- `start_onboard` - Projekt-Onboarding
- `start_ui` - UI-Entwicklung (Design-System → Komponenten → Code)
- `start_product` - Produktdesign (PRD → Prototyp → HTML)
- `start_ralph` - Ralph Loop (Iterative Entwicklung)

### 🚀 Produktdesign-Workflow

`start_product`: Von Anforderungen zum interaktiven Prototyp. Schritte: Anforderungsanalyse → Prototyp → Design-System → HTML → Projektkontext.

### 🎨 UI/UX Pro Max

UI/UX-Tools mit `start_ui` als einheitlichem Einstiegspunkt:
- `start_ui` - UI-Entwicklung mit einem Klick
- `ui_design_system` - Design-System-Generierung
- `ui_search` - UI/UX-Datensuche (BM25)
- `sync_ui_data` - UI/UX-Daten synchronisieren

**Skill Bridge für UI/PRD-Workflows:**
- `start_ui` und `start_product` enthalten jetzt einen Skill Bridge-Abschnitt
- Empfohlene Reihenfolge: `ui-ux-pro-max` → `interaction-design` → `frontend-design`

**Inspiration:**
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [json-render](https://github.com/vercel-labs/json-render)

### 🎤 Anforderungsinterview

- `interview` - Strukturiertes Anforderungsinterview
- `ask_user` - KI proaktive Befragung

---

## 🧭 Tool-Auswahlhilfe

| Szenario | Empfohlenes Tool | Grund |
|---------|-----------------|--------|
| Neue Funktion (kompletter Flow) | `start_feature` | Auto: Spec → Schätzung |
| Nur Spec-Docs | `add_feature` | Leichter |
| Bugfix (kompletter Flow) | `start_bugfix` | TBP RCA → Fix → Test |
| Nur Bug-Analyse | `fix_bug` | TBP 8-Schritte RCA |
| Design-System generieren | `ui_design_system` | Direkte Generierung |
| UI-Komponenten entwickeln | `start_ui` | Kompletter Flow |
| Produktdesign | `start_product` | PRD → Prototyp → HTML |
| Anforderungsanalyse | `init_project` | Vollständige Spec-Docs |
| Projekt-Onboarding-Docs | `init_project_context` | Tech-Stack/Architektur |

---

## 🚀 Schnellstart

### Methode 1: npx (Empfohlen)

#### Cursor / Cline Konfiguration

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

#### Claude Desktop Konfiguration

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

#### OpenCode Konfiguration

**Speicherort:** `opencode.json` (Projekt) oder `~/.config/opencode/opencode.json` (global)

```json
{
  "mcp": {
    "mcp-probe-kit": {
      "type": "local",
      "command": ["npx", "-y", "mcp-probe-kit@latest"],
      "enabled": true
    }
  }
}
```

> **Hinweis:** OpenCode verwendet `opencode.json` mit anderem Schema. `mcp` ersetzt `mcpServers`, `command` ist ein Array, `type: "local"` erforderlich, Umgebungsvariablen via `environment`. Siehe [OpenCode MCP docs](https://opencode.ai/docs/mcp).

### Methode 2: Globale Installation

```bash
npm install -g mcp-probe-kit
```

### Optionales Memory-System-Setup

#### Option A: Qdrant + Ollama

```bash
docker run -d --name mcp-qdrant -p 6333:6333 qdrant/qdrant
ollama pull nomic-embed-text
```

```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"],
      "env": {
        "MEMORY_QDRANT_URL": "http://127.0.0.1:6333",
        "MEMORY_QDRANT_COLLECTION": "mcp_probe_memory",
        "MEMORY_EMBEDDING_PROVIDER": "ollama",
        "MEMORY_EMBEDDING_URL": "http://127.0.0.1:11434/api/embeddings",
        "MEMORY_EMBEDDING_MODEL": "nomic-embed-text",
        "MEMORY_SEARCH_LIMIT": "3",
        "MEMORY_SUMMARY_MAX_CHARS": "280"
      }
    }
  }
}
```

#### Option B: Qdrant + OpenAI-kompatibel

```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "npx",
      "args": ["-y", "mcp-probe-kit@latest"],
      "env": {
        "MEMORY_QDRANT_URL": "http://127.0.0.1:6333",
        "MEMORY_QDRANT_COLLECTION": "mcp_probe_memory",
        "MEMORY_EMBEDDING_PROVIDER": "openai-compatible",
        "MEMORY_EMBEDDING_URL": "https://your-embedding-endpoint/v1/embeddings",
        "MEMORY_EMBEDDING_API_KEY": "your-api-key",
        "MEMORY_EMBEDDING_MODEL": "text-embedding-3-small"
      }
    }
  }
}
```

### Memory-Umgebungsvariablen

- `MEMORY_QDRANT_URL` : Qdrant URL (erforderlich)
- `MEMORY_QDRANT_API_KEY` : Qdrant API-Key (optional)
- `MEMORY_QDRANT_COLLECTION` : Collection-Name (Standard `mcp_probe_memory`)
- `MEMORY_EMBEDDING_PROVIDER` : `ollama` oder `openai-compatible`
- `MEMORY_EMBEDDING_URL` : Embedding-Endpoint-URL
- `MEMORY_EMBEDDING_API_KEY` : Embedding API-Key
- `MEMORY_EMBEDDING_MODEL` : Modell (Standard `nomic-embed-text`)
- `MEMORY_SEARCH_LIMIT` : Ergebnisse (Standard `3`)
- `MEMORY_SUMMARY_MAX_CHARS` : Kürzung (Standard `280`)

### Windows-Hinweise für Graph-Tools

- GitNexus nutzt standardmäßig `npx -y gitnexus@latest mcp`. Erster Kaltstart: 20+ Sekunden.
- Einige Abhängigkeiten (`tree-sitter-*`) benötigen Visual Studio Build Tools.

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

Beispiel mit vorinstalliertem gitnexus:

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

### Client neu starten

Nach der Konfiguration den MCP-Client **vollständig beenden und neu öffnen**.

---

## 💡 Anwendungsbeispiele

```bash
# Tägliche Entwicklung
code_review @feature.ts
gentest @feature.ts
gencommit

# Neue Funktion
start_feature user-auth "Benutzerauthentifizierungsfunktion"

# Bugfix
start_bugfix

# Produktdesign
start_product "Online-Bildungsplattform" --product_type=SaaS

# UI-Entwicklung
start_ui "Anmeldeseite" --mode=auto

# Projektkontext (Einzeldatei)
init_project_context

# Projektkontext (Modular)
init_project_context --mode=modular

# Git-Tagesbericht
git_work_report --date 2026-02-03

# Git-Wochenbericht
git_work_report --start_date 2026-02-01 --end_date 2026-02-07
```

---

## ❓ FAQ

### Q1: Tool funktioniert nicht?

```bash
npx -y mcp-probe-kit@latest 2>&1 | tee ./mcp-probe-kit.log
```

### Q2: Client erkennt Tools nicht?

1. Client neu starten
2. Konfigurationspfad prüfen
3. JSON-Syntax prüfen

### Q3: Wie aktualisieren?

**npx:** `@latest` verwenden. **Global:** `npm update -g mcp-probe-kit`

### Q4: Warum sind Graph-Tools unter Windows langsam?

Ursache: `npx -y gitnexus@latest mcp` (Kaltstart) + native `tree-sitter-*` Module.

Lösung:
1. Visual Studio Build Tools mit C++ installieren
2. Wenn Client `env` unterstützt, vorinstallierte `gitnexus` CLI nutzen und `MCP_GITNEXUS_CONNECT_TIMEOUT_MS` / `MCP_GITNEXUS_TIMEOUT_MS` erhöhen

---

## 🤝 Mitwirken

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

**Verwandte Projekte:**
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [json-render](https://github.com/vercel-labs/json-render)
- [uipro-cli](https://www.npmjs.com/package/uipro-cli)

---

**Made with ❤️ for AI-Powered Development**