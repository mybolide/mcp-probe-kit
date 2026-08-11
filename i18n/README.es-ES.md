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
> mcp-probe-kit es un kit a nivel de protocolo para explorar contexto y orquestar el desarrollo. v4 muestra 24 herramientas al modelo por defecto, 30 con Memory completamente configurado y conserva una superficie full compatible de 34 herramientas.

**Idiomas**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | **Español** | [Français](README.fr-FR.md) | [Deutsch](README.de-DE.md) | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 Kit de Herramientas de Desarrollo Completo Impulsado por IA - Cubriendo Todo el Ciclo de Vida del Desarrollo

Un potente servidor MCP con **24 herramientas visibles para el modelo por defecto**, **30 con Memory completo** y **34 herramientas de compatibilidad** mediante `MCP_TOOLSET=full`. Admite salida estructurada, protocolos Legacy/Modern y MCP Apps oficiales.

**🎉 Candidato v4**: MCP Apps nativas, planes reanudables, convergencia por evidencias, GitNexus Sidecar administrado, especificaciones padre-hijo y CLI fallback fijado.

**Soporta Todos los Clientes MCP**: Cursor, Claude Desktop, Cline, Continue y más

**Compatibilidad de protocolo**: Legacy MCP (2025-era) + Modern MCP 2026-07-28 · **SDK**: paquetes separados de TypeScript SDK v2 · **Runtime**: Node.js 20+

---

<!-- v4-showcase:start -->
## 🎬 v4 en acción

v4 convierte la ejecución delegada del Agent en un ciclo de entrega observable, reanudable y verificable. Las animaciones se generan con el mismo código de MCP Apps incluido en el paquete npm.

<p align="center">
  <a href="https://mcp-probe-kit.bytezonex.com/pages/apps.html"><img src="../docs/assets/demos/feature-workbench.gif" alt="Feature Workbench animated demo" width="920"/></a>
</p>

**Feature Workbench**: especificaciones padre-hijo, paso activo, entregables, evidencias y recuperación entre sesiones.

<p align="center">
  <a href="https://mcp-probe-kit.bytezonex.com/pages/apps.html#memory"><img src="../docs/assets/demos/memory-center.gif" alt="Memory Center animated demo" width="920"/></a>
</p>

<strong>Memory Center</strong>: búsqueda semántica, contenido completo, ciclo de vida, evidencias, marcado obsoleto y borrado confirmado.

<p align="center">
  <a href="https://mcp-probe-kit.bytezonex.com/pages/apps.html#convergence"><img src="../docs/assets/demos/convergence-gate.gif" alt="Convergence Gate animated demo" width="920"/></a>
</p>

<strong>Convergence Gate</strong>: bloquea el cierre cuando faltan pasos o evidencias de requisitos, especificación, implementación, pruebas o revisión.

- **Cinco MCP Apps nativas**: Memory, Feature, Bug, Product y Convergence.
- **Planes delegados reanudables**: `plan_heartbeat` guarda el progreso real y `resume_plan` recupera el siguiente paso.
- **Convergencia basada en evidencias**: `converge` controla la entrega y la escritura en Memory a largo plazo.
- **GitNexus Sidecar administrado**: aislamiento por versión, plataforma, arquitectura y Node; integridad y FTS real verificados.
- **CLI fallback con versión fijada**: el `probe` local usa el mismo Tool Registry si el Host pierde el lease MCP.
- **Especificaciones padre-hijo**: los releases complejos se descomponen y validan recursivamente.

**[Abrir las cinco demos interactivas y de solo lectura](https://mcp-probe-kit.bytezonex.com/pages/apps.html)**

> **Canal preview de v4:** usa `mcp-probe-kit@next` (candidato actual `4.0.0-rc.10`). npm `latest` sigue en la versión estable `3.7.0`. Fija una versión exacta para evaluación en producción.
<!-- v4-showcase:end -->

---

## 📚 Documentación Completa

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Inicio Rápido](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Configuración en 5 minutos
- [Todas las Herramientas](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Superficies predeterminada, Memory condicional, App-only y compatibilidad full
- [Mejores Prácticas](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Guía completa del flujo de trabajo
- [Guía de migración v3 → v4](https://mcp-probe-kit.bytezonex.com/pages/migration-v4.html) - Superficies, protocolo, Apps, estado del plan, Memory y compatibilidad
- [Demos de MCP Apps](https://mcp-probe-kit.bytezonex.com/pages/apps.html) - Cinco workbenches de solo lectura generados con el código real

---

## ✨ Características Principales

### 📦 Superficies de herramientas

- **`compact` por defecto**: 24 herramientas visibles para el modelo; conserva entradas independientes como `start_product`, `gencommit`, `plan_heartbeat`, `resume_plan`, `converge` y `architecture`.
- **Memory completamente configurado**: añade dinámicamente seis herramientas Memory, para un total de 30 visibles.
- **`MCP_TOOLSET=full`**: restaura 34 herramientas de modelo compatibles para flujos antiguos y diagnóstico.
- **MCP Apps**: `list_memory_assets` es exclusivo de Memory Center, con `visibility=["app"]`, y no cuenta como herramienta del modelo.
- `add_feature`, `fix_bug`, `sync_ui_data` y `ask_user` se ocultan por defecto, pero sus capacidades siguen disponibles mediante orquestación, scripts de mantenimiento o el modo full.

### 🧠 Puente de Grafo de Código (GitNexus)

- `code_insight` usa GitNexus por defecto para análisis query/context/impact
- GitNexus usa un Sidecar administrado que fija `gitnexus@1.6.9`, verifica la integridad y la capacidad FTS real, y reutiliza el runtime por plataforma, arquitectura y versión principal de Node.
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

**Configuración de embedding compatible con OpenAI:**
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
- `start_bugfix` - Corrección de bug (SRC-8 RCA → Fix → Tests)
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
| Solo análisis de bug | `fix_bug` | SRC-8 + rootCauseWorksheet |
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
      "args": ["mcp-probe-kit@next"]
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
      "args": ["-y", "mcp-probe-kit@next"]
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
      "command": ["npx", "-y", "mcp-probe-kit@next"],
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

#### Opción B: Qdrant + Compatible con OpenAI

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

- La primera instalación del Sidecar descarga dependencias nativas y ejecuta la sonda de capacidades; las llamadas posteriores reutilizan el runtime verificado.
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
npx -y mcp-probe-kit@next 2>&1 | tee ./mcp-probe-kit.log
```

### Q2: ¿El cliente no reconoce las herramientas?

1. Reinicia el cliente
2. Verifica la ruta del archivo de configuración
3. Verifica la sintaxis JSON

### Q3: ¿Cómo actualizar?

**npx:** usa `@latest`. **Global:** `npm update -g mcp-probe-kit`

### Q4: ¿Por qué las herramientas de grafo son lentas en Windows?

Causa: la primera instalación del Sidecar administrado incluye dependencias nativas y la sonda FTS; no descarga `@latest` en cada llamada.

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
