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
> mcp-probe-kit ist ein Protokoll-Toolkit für Kontextanalyse und Entwicklungs-Orchestrierung. v4 zeigt dem Modell standardmäßig 24 Tools, 30 bei vollständiger Memory-Konfiguration und behält eine Full-Kompatibilitätsfläche mit 34 Tools.

**Sprachen**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Español](README.es-ES.md) | [Français](README.fr-FR.md) | **Deutsch** | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 KI-gestütztes Vollständiges Entwicklungs-Toolkit – Abdeckung des gesamten Entwicklungslebenszyklus

Ein leistungsstarker MCP-Server mit **24 modell-sichtbaren Tools standardmäßig**, **30 bei vollständiger Memory-Konfiguration** und **34 Kompatibilitäts-Tools** über `MCP_TOOLSET=full`. Strukturierte Ausgabe, Legacy/Modern-Doppelprotokoll und offizielle MCP Apps werden unterstützt.

**🎉 v4 Release Candidate**: native MCP Apps, fortsetzbare Pläne, Nachweis-Konvergenz, verwalteter GitNexus Sidecar, Parent-Child-Specs und versionsgebundener CLI-Fallback.

**Unterstützt alle MCP-Clients**: Cursor, Claude Desktop, Cline, Continue und mehr

**Protokollunterstützung**: Legacy MCP (2025-era) + Modern MCP 2026-07-28 · **SDK**: geteilte TypeScript-SDK-v2-Pakete · **Runtime**: Node.js 20+

---

<!-- v4-showcase:start -->
## 🎬 v4 in Aktion

v4 macht die delegierte Agent-Ausführung zu einem beobachtbaren, fortsetzbaren und überprüfbaren Lieferzyklus. Die Animationen werden aus demselben MCP-App-Code erzeugt, der im npm-Paket ausgeliefert wird.

<p align="center">
  <a href="https://mcp-probe-kit.bytezonex.com/pages/apps.html"><img src="../docs/assets/demos/feature-workbench.gif" alt="Feature Workbench animated demo" width="920"/></a>
</p>

**Feature Workbench**: Parent-Child-Spezifikationen, aktiver Schritt, Ergebnisse, Nachweise und sitzungsübergreifende Wiederaufnahme.

<p align="center">
  <a href="https://mcp-probe-kit.bytezonex.com/pages/apps.html#memory"><img src="../docs/assets/demos/memory-center.gif" alt="Memory Center animated demo" width="920"/></a>
</p>

<strong>Memory Center</strong>: semantische Suche, Volltext, Lebenszyklus, Nachweise, Veraltet-Markierung und bestätigtes Löschen.

<p align="center">
  <a href="https://mcp-probe-kit.bytezonex.com/pages/apps.html#convergence"><img src="../docs/assets/demos/convergence-gate.gif" alt="Convergence Gate animated demo" width="920"/></a>
</p>

<strong>Convergence Gate</strong>: blockiert den Abschluss, wenn Schritte oder Anforderungs-/Spec-/Implementierungs-/Test-/Review-Nachweise fehlen.

- **Fünf native MCP Apps**: Memory, Feature, Bug, Product und Convergence.
- **Fortsetzbare delegierte Pläne**: `plan_heartbeat` speichert realen Fortschritt; `resume_plan` stellt den nächsten Schritt wieder her.
- **Nachweisbasierte Konvergenz**: `converge` steuert Lieferung und langfristige Memory-Schreibvorgänge.
- **Verwalteter GitNexus Sidecar**: Isolation nach Version, Plattform, Architektur und Node; Integrität und echtes FTS werden geprüft.
- **Versionsgebundener CLI-Fallback**: Der lokale `probe` nutzt dasselbe Tool Registry, wenn der Host den MCP-Lease verliert.
- **Parent-Child-Spezifikationen**: komplexe Releases werden zerlegt und rekursiv validiert.

**[Fünf interaktive, schreibgeschützte MCP-App-Demos öffnen](https://mcp-probe-kit.bytezonex.com/pages/apps.html)**

> **v4-Preview-Kanal:** Verwenden Sie `mcp-probe-kit@next` (aktueller Kandidat `4.0.0-rc.10`). npm `latest` bleibt der stabile Kanal `3.7.0`. Für Produktionstests eine exakte Version fixieren.
<!-- v4-showcase:end -->

---

## 📚 Vollständige Dokumentation

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Schnellstart](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Einrichtung in 5 Minuten
- [Alle Tools](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Standard-, Memory-bedingte, App-only- und Full-Kompatibilitätsflächen
- [Best Practices](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Vollständiger Entwicklungs-Workflow-Leitfaden
- [v3 → v4 Migrationsleitfaden](https://mcp-probe-kit.bytezonex.com/pages/migration-v4.html) - Tool-Flächen, Protokoll, Apps, Planstatus, Memory und Kompatibilität
- [MCP Apps Live-Demos](https://mcp-probe-kit.bytezonex.com/pages/apps.html) - Fünf schreibgeschützte Workbenches aus dem echten App-Code

---

## ✨ Kernfunktionen

### 📦 Tool-Flächen

- **Standard `compact`**: 24 modell-sichtbare Tools; eigenständige Einstiegspunkte wie `start_product`, `gencommit`, `plan_heartbeat`, `resume_plan`, `converge` und `architecture` bleiben erhalten.
- **Vollständige Memory-Konfiguration**: sechs Memory-Tools werden dynamisch ergänzt, insgesamt 30 modell-sichtbare Tools.
- **`MCP_TOOLSET=full`**: stellt 34 kompatible Modell-Tools für alte Abläufe und Diagnose wieder her.
- **MCP Apps**: `list_memory_assets` ist nur für das Memory Center sichtbar (`visibility=["app"]`) und zählt nicht zur Modellfläche.
- `add_feature`, `fix_bug`, `sync_ui_data` und `ask_user` sind standardmäßig ausgeblendet; ihre Fähigkeiten bleiben über Orchestrierung, Wartungsskripte oder den Full-Modus erhalten.

### 🧠 Code-Graph-Bridge (GitNexus)

- `code_insight` verbindet GitNexus standardmäßig für Query/Context/Impact-Analysen
- GitNexus verwendet einen verwalteten Sidecar, der `gitnexus@1.6.9` fixiert, Integrität und echtes FTS prüft und die Runtime nach Plattform, Architektur und Node-Hauptversion wiederverwendet.
- `init_project_context` erzeugt Baseline-Graph-Dokumente unter `docs/graph-insights/`
- `start_feature` und `start_bugfix` aktualisieren den GitNexus-Index
- Wenn GitNexus nicht verfügbar ist, fällt der Server automatisch zurück
- Graph-Snapshots werden als Ressourcen bereitgestellt (`probe://graph/latest`, etc.)
- Snapshots werden in `.mcp-probe-kit/graph-snapshots` persistiert

### 🐛 SRC-8 Bug RCA (TBP-inspired)

- `start_bugfix`: SRC-8 → Fix → Tests; `fix_bug`: **rootCauseWorksheet** (see docs/src8-methodology.md)
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
      "args": ["-y", "mcp-probe-kit@next"],
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
      "args": ["-y", "mcp-probe-kit@next"],
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
- `start_bugfix` - Bugfix (SRC-8 RCA → Fix → Tests)
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
| Nur Bug-Analyse | `fix_bug` | SRC-8 guidance + rootCauseWorksheet |
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
      "args": ["mcp-probe-kit@next"]
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
      "args": ["-y", "mcp-probe-kit@next"]
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
      "command": ["npx", "-y", "mcp-probe-kit@next"],
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
      "args": ["-y", "mcp-probe-kit@next"],
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
      "args": ["-y", "mcp-probe-kit@next"],
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

- Bei der ersten Sidecar-Installation werden native Abhängigkeiten geladen und Capability-Probes ausgeführt; danach wird die geprüfte Runtime wiederverwendet.
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
npx -y mcp-probe-kit@next 2>&1 | tee ./mcp-probe-kit.log
```

### Q2: Client erkennt Tools nicht?

1. Client neu starten
2. Konfigurationspfad prüfen
3. JSON-Syntax prüfen

### Q3: Wie aktualisieren?

**npx:** `@latest` verwenden. **Global:** `npm update -g mcp-probe-kit`

### Q4: Warum sind Graph-Tools unter Windows langsam?

Ursache: Die erste verwaltete Sidecar-Installation umfasst native Abhängigkeiten und den FTS-Probe; `@latest` wird nicht bei jedem Aufruf geladen.

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
