# mcp-probe-kit — Conoce el Contexto, Alimenta el Momento

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
> mcp-probe-kit es un kit de herramientas a nivel de protocolo diseñado para desarrolladores que quieren que la IA entienda realmente la intención de su proyecto. No es solo una colección de 30 herramientas — es un sistema consciente del contexto que ayuda a los agentes de IA a comprender lo que estás construyendo.

**Idiomas**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | **Español** | [Français](README.fr-FR.md) | [Deutsch](README.de-DE.md) | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 Kit de Herramientas de Desarrollo Completo Impulsado por IA - Cubriendo Todo el Ciclo de Vida del Desarrollo

Un potente servidor MCP (Model Context Protocol) que proporciona **30 herramientas** cubriendo el flujo de trabajo completo desde el análisis del producto hasta el lanzamiento final (Requisitos → Diseño → Desarrollo → Calidad → Lanzamiento), todas las herramientas soportan **salida estructurada**.

**🎉 Actualización Mayor v3.0**: Número de herramientas simplificado, enfoque en competencias centrales, eliminación de parálisis de elección, más trabajo nativo para la IA

**Soporta Todos los Clientes MCP**: Cursor, Claude Desktop, Cline, Continue y más

**Versión del Protocolo**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.27.1

---

## 📚 Documentación Completa

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Inicio Rápido](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Configuración en 5 minutos
- [Todas las Herramientas](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Lista completa de 30 herramientas
- [Mejores Prácticas](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Guía completa del flujo de trabajo
- [Guía de Migración v3.0](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Actualización de v2.x a v3.0

---

## ✨ Características Principales

### 📦 30 Herramientas

- **🔄 Orquestación de Flujos de Trabajo** (6 herramientas) - Flujos complejos con un clic
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Análisis de Código** (4 herramientas) - Calidad, refactorización y graph insight
  - `code_review`, `code_insight`, `fix_bug`, `refactor`
- **📝 Herramientas Git** (2 herramientas) - Commits e informes de trabajo
  - `gencommit`, `git_work_report`
- **⚡ Generación de Código** (1 herramienta) - Generación de pruebas
  - `gentest`
- **📦 Gestión de Proyectos** (7 herramientas) - Inicialización, requisitos y validación de specs
  - `init_project`, `init_project_context`, `add_feature`, `check_spec`, `estimate`, `interview`, `ask_user`
- **🎨 Utilidades UI/UX** (3 herramientas) - Sistemas de diseño y sincronización de datos
  - `ui_design_system`, `ui_search`, `sync_ui_data`
- **🧠 Memory** (6 herramientas) - Memoria de activos reutilizables
  - `search_memory`, `read_memory_asset`, `memorize_asset`, `update_memory_asset`, `delete_memory_asset`, `scan_and_extract_patterns`

### 🧠 Puente de Grafo de Código (GitNexus)

- `code_insight` usa GitNexus por defecto para análisis query/context/impact
- El puente inicia `npx -y gitnexus@latest mcp` por defecto
- `init_project_context` genera documentos base de grafo bajo `docs/graph-insights/`
- `start_feature` y `start_bugfix` refrescan el índice GitNexus
- Si GitNexus no está disponible, el servidor hace fallback automático
- Snapshots de grafo expuestos como recursos (`probe://graph/latest`, etc.)
- Snapshots persistidos en `.mcp-probe-kit/graph-snapshots`

### 🐛 RCA TBP de 8 Pasos para Flujos de Bugs

- `start_bugfix` usa análisis de causa raíz Toyota TBP de 8 pasos por defecto
- `fix_bug` devuelve esqueleto TBP estructurado con fenómeno, timeline, caminos descartados, frontera, causa raíz, evidencias y plan de reparación

### 🧠 Recuperación de Memoria

- Herramientas de memoria usan **Qdrant** como backend de base de datos vectorial
- Servicio de embedding soporta: `ollama` y `openai-compatible`

**Herramientas de memoria:**
- `search_memory` - Búsqueda semántica en el pool compartido
- `memorize_asset` - Persistir activos reutilizables en memoria vectorial
- `read_memory_asset` - Leer contenido completo por `asset_id`
- `update_memory_asset` - Actualizar activo existente por `asset_id` (conserva ID)
- `delete_memory_asset` - Eliminar activo por `asset_id`
- `scan_and_extract_patterns` - Extraer patrones reutilizables

**Configuración local recomendada (Qdrant + Ollama):**
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

**Configuración de embedding compatible con OpenAI:**
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

### 🎯 Salida Estructurada

Herramientas núcleo y de orquestación soportan **salida estructurada** con datos JSON legibles por máquina.

### ⏱️ Tareas Nativas, Progreso y Cancelación

- Basado en soporte nativo de tareas del SDK MCP (`taskStore` + `taskMessageQueue`)
- Soporta endpoints: `tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel`
- Declara `capabilities.tasks.requests.tools.call`
- Emite `notifications/progress` con `_meta.progressToken`
- Maneja cancelación via `AbortSignal`
- Herramientas de larga duración (`start_*`) y `sync_ui_data` soportan cancelación cooperativa

### 🔌 Extensiones y UI Apps (Opcional)

- Paso de metadata de trace: `_meta.trace` preservado en respuestas
- Interruptor de extensiones: `MCP_ENABLE_EXTENSIONS_CAPABILITY=1`
- Salida de recursos UI Apps: `MCP_ENABLE_UI_APPS=1`
- Herramientas UI exponen recursos via `ui://...` y `_meta.ui.resourceUri`

### 🧭 Protocolo de Orquestación Delegada

Todas las herramientas `start_*` devuelven un **plan de ejecución** en `structuredContent.metadata.plan`. La IA debe **llamar herramientas paso a paso y persistir archivos**.

**Esquema del Plan:**
```json
{
  "mode": "delegated",
  "steps": [
    {
      "id": "spec",
      "tool": "add_feature",
      "args": { "feature_name": "user-auth", "description": "Autenticación de usuario" },
      "outputs": ["docs/specs/user-auth/requirements.md"]
    }
  ]
}
```

### 🧩 Especificación de Campos de Salida Estructurada

- `summary` : Resumen en una línea
- `status` : Estado (pending/success/failed/partial)
- `steps` : Pasos de ejecución (herramientas de orquestación)
- `artifacts` : Lista de artefactos
- `metadata.plan` : Plan delegado (solo start_*)
- `specArtifacts` : Artefactos de especificación (start_feature)
- `estimate` : Resultados de estimación (start_feature / estimate)

### 🧠 Modo de Clarificación de Requisitos (Requirements Loop)

Usa `requirements_mode=loop` en `start_feature / start_bugfix / start_ui` para 1-2 rondas de clarificación estructurada.

```json
{
  "feature_name": "user-auth",
  "description": "Función de autenticación de usuario",
  "requirements_mode": "loop",
  "loop_max_rounds": 2,
  "loop_question_budget": 5
}
```

### 🧩 Sistema de Plantillas

`add_feature` soporta perfiles de plantilla: `guided` (requisitos incompletos), `strict` (completos), `auto` (selección automática).

```json
{
  "description": "Agregar autenticación de usuario",
  "template_profile": "auto"
}
```

### 🔄 Orquestación de Flujos de Trabajo

6 herramientas de orquestación:
- `start_feature` - Nueva función (Requisitos → Diseño → Estimación)
- `start_bugfix` - Corrección de bug (RCA TBP 8 pasos → Fix → Tests)
- `start_onboard` - Incorporación al proyecto
- `start_ui` - Desarrollo UI (Sistema de diseño → Componentes → Código)
- `start_product` - Diseño de producto (PRD → Prototipo → HTML)
- `start_ralph` - Ralph Loop (Desarrollo iterativo)

### 🚀 Flujo de Diseño de Producto

`start_product`: De requisitos a prototipo interactivo. Pasos: Análisis → Prototipo → Sistema de Diseño → HTML → Contexto del Proyecto.

### 🎨 UI/UX Pro Max

Herramientas UI/UX con `start_ui` como entrada unificada:
- `start_ui` - Desarrollo UI en un clic
- `ui_design_system` - Generación de sistema de diseño
- `ui_search` - Búsqueda de datos UI/UX (BM25)
- `sync_ui_data` - Sincronizar datos UI/UX

**Skill Bridge para flujos UI/PRD:**
- `start_ui` y `start_product` incluyen sección Skill Bridge
- Orden recomendado: `ui-ux-pro-max` → `interaction-design` → `frontend-design`

**Inspiración:**
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [json-render](https://github.com/vercel-labs/json-render)

### 🎤 Entrevista de Requisitos

- `interview` - Entrevista estructurada de requisitos
- `ask_user` - Pregunta proactiva de la IA

---

## 🧭 Guía de Selección de Herramientas

| Escenario | Herramienta | Razón |
|---------|-----------|------|
| Nueva función (flujo completo) | `start_feature` | Auto: Spec → Estimación |
| Solo docs de spec | `add_feature` | Más ligero |
| Corrección de bug (flujo completo) | `start_bugfix` | TBP RCA → Fix → Test |
| Solo análisis de bug | `fix_bug` | RCA TBP 8 pasos |
| Generar sistema de diseño | `ui_design_system` | Generación directa |
| Desarrollar componentes UI | `start_ui` | Flujo completo |
| Diseño de producto | `start_product` | PRD → Prototipo → HTML |
| Análisis de requisitos | `init_project` | Docs de spec completos |
| Docs de incorporación | `init_project_context` | Stack técnico/arquitectura |

---

## 🚀 Inicio Rápido

### Método 1: npx (Recomendado)

#### Configuración Cursor / Cline

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

#### Configuración Claude Desktop

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

#### Configuración OpenCode

**Ubicación:** `opencode.json` (proyecto) o `~/.config/opencode/opencode.json` (global)

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

> **Nota:** OpenCode usa `opencode.json` con esquema diferente. `mcp` reemplaza `mcpServers`, `command` es un array, `type: "local"` requerido, variables de entorno via `environment`. Ver [OpenCode MCP docs](https://opencode.ai/docs/mcp).

### Método 2: Instalación Global

```bash
npm install -g mcp-probe-kit
```

### Configuración Opcional del Sistema de Memoria

#### Opción A: Qdrant + Ollama

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

#### Opción B: Qdrant + Compatible con OpenAI

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

### Variables de Entorno de Memoria

- `MEMORY_QDRANT_URL` : URL Qdrant (requerido)
- `MEMORY_QDRANT_API_KEY` : Clave API Qdrant (opcional)
- `MEMORY_QDRANT_COLLECTION` : Colección (por defecto `mcp_probe_memory`)
- `MEMORY_EMBEDDING_PROVIDER` : `ollama` o `openai-compatible`
- `MEMORY_EMBEDDING_URL` : URL del endpoint de embedding
- `MEMORY_EMBEDDING_API_KEY` : Clave API embedding
- `MEMORY_EMBEDDING_MODEL` : Modelo (por defecto `nomic-embed-text`)
- `MEMORY_SEARCH_LIMIT` : Resultados (por defecto `3`)
- `MEMORY_SUMMARY_MAX_CHARS` : Truncado (por defecto `280`)

### Notas de Windows para Herramientas de Grafo

- GitNexus usa `npx -y gitnexus@latest mcp` por defecto. Primer arranque en frío: 20+ segundos.
- Algunas dependencias (`tree-sitter-*`) requieren Visual Studio Build Tools.

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

Ejemplo con gitnexus preinstalado:

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

### Reiniciar el Cliente

Después de la configuración, **cierra completamente y vuelve a abrir** tu cliente MCP.

---

## 💡 Ejemplos de Uso

```bash
# Desarrollo diario
code_review @feature.ts
gentest @feature.ts
gencommit

# Nueva función
start_feature user-auth "Función de autenticación de usuario"

# Corrección de bug
start_bugfix

# Diseño de producto
start_product "Plataforma de educación en línea" --product_type=SaaS

# Desarrollo UI
start_ui "Página de inicio de sesión" --mode=auto

# Contexto del proyecto (archivo único)
init_project_context

# Contexto del proyecto (modular)
init_project_context --mode=modular

# Informe Git diario
git_work_report --date 2026-02-03

# Informe Git semanal
git_work_report --start_date 2026-02-01 --end_date 2026-02-07
```

---

## ❓ FAQ

### Q1: ¿La herramienta no funciona?

```bash
npx -y mcp-probe-kit@latest 2>&1 | tee ./mcp-probe-kit.log
```

### Q2: ¿El cliente no reconoce las herramientas?

1. Reinicia el cliente
2. Verifica la ruta del archivo de configuración
3. Verifica la sintaxis JSON

### Q3: ¿Cómo actualizar?

**npx:** usa `@latest`. **Global:** `npm update -g mcp-probe-kit`

### Q4: ¿Por qué las herramientas de grafo son lentas en Windows?

Causa: `npx -y gitnexus@latest mcp` (arranque en frío) + módulos nativos `tree-sitter-*`.

Solución:
1. Instala Visual Studio Build Tools con C++
2. Si el cliente soporta `env`, usa CLI `gitnexus` preinstalada y aumenta `MCP_GITNEXUS_CONNECT_TIMEOUT_MS` / `MCP_GITNEXUS_TIMEOUT_MS`

---

## 🤝 Contribución

¡Issues y Pull Requests son bienvenidos!

---

## 📄 Licencia

MIT License

---

## 🔗 Enlaces

- **Autor**: [Kyle (小墨)](https://www.bytezonex.com/)
- **GitHub**: [mcp-probe-kit](https://github.com/mybolide/mcp-probe-kit)
- **npm**: [mcp-probe-kit](https://www.npmjs.com/package/mcp-probe-kit)
- **Documentación**: [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)

**Proyectos relacionados:**
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [json-render](https://github.com/vercel-labs/json-render)
- [uipro-cli](https://www.npmjs.com/package/uipro-cli)

---

**Made with ❤️ for AI-Powered Development**