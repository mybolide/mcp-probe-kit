<div align="center">
<img src="../docs/assets/logo.png" alt="知时MCP Logo" width="160"/>
<h1>知时MCP | mcp-probe-kit</h1>
<p><strong>Conoce el Contexto, Alimenta el Momento.</strong></p>
<p><code>Introspection</code> · <code>Context Hydration</code> · <code>Delegated Orchestration</code></p>
</div>

---

**Talk is cheap, show me the Context.**

> Zhishi MCP es un kit de herramientas de sondeo a nivel de protocolo y suministro de contexto diseñado para geeks. No es solo una colección de 28 herramientas, sino un sistema de percepción que permite a la IA "comprender" verdaderamente la intención de tu proyecto.

**Idiomas**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | **Español** | [Français](README.fr-FR.md) | [Deutsch](README.de-DE.md) | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 Kit de Herramientas de Desarrollo Completo Impulsado por IA - Cubriendo Todo el Ciclo de Vida del Desarrollo

Un potente servidor MCP (Model Context Protocol) que proporciona **28 herramientas** que cubren el flujo de trabajo completo desde el análisis del producto hasta el lanzamiento final (Requisitos → Diseño → Desarrollo → Calidad → Lanzamiento), todas las herramientas soportan **salida estructurada**.

**🎉 Actualización Mayor v3.0**: Número de herramientas simplificado, enfoque en competencias centrales, eliminación de parálisis de elección, permitiendo que la IA haga más trabajo nativo

**Soporta Todos los Clientes MCP**: Cursor, Claude Desktop, Cline, Continue y más

**Versión del Protocolo**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.27.1

---

## 📚 Documentación Completa

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Inicio Rápido](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Configuración en 5 minutos
- [Todas las Herramientas](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Lista completa de 28 herramientas
- [Mejores Prácticas](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Guía completa del flujo de trabajo de desarrollo
- [Guía de Migración v3.0](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Actualización de v2.x a v3.0

---

## ✨ Características Principales

### 📦 28 Herramientas

- **🔄 Orquestación de Flujos de Trabajo** (6 herramientas) - Flujos de trabajo de desarrollo complejos con un clic
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Análisis de Código** (4 herramientas) - Calidad de código, refactorización y graph insight
  - `code_review`, `code_insight`, `fix_bug`, `refactor`
- **📝 Herramientas Git** (2 herramientas) - Commits Git e informes de trabajo
  - `gencommit`, `git_work_report`
- **⚡ Generación de Código** (1 herramienta) - Generación de pruebas
  - `gentest`
- **📦 Gestión de Proyectos** (6 herramientas) - Inicialización de proyectos y gestión de requisitos
  - `init_project`, `init_project_context`, `add_feature`, `estimate`, `interview`, `ask_user`
- **🎨 Herramientas UI/UX** (3 herramientas) - Sistemas de diseño y sincronización de datos UI
  - `ui_design_system`, `ui_search`, `sync_ui_data`
- **🧠 Memory y Cursor History** (6 herramientas) - Memoria de activos reutilizables y lectura local de conversaciones de Cursor
  - `read_memory_asset`, `memorize_asset`, `scan_and_extract_patterns`, `cursor_list_conversations`, `cursor_search_conversations`, `cursor_read_conversation`

### 🧠 Puente de grafo de código (GitNexus)

- `code_insight` usa GitNexus por defecto para análisis de query/context/impact
- El bridge lanza por defecto `npx -y gitnexus@latest mcp` para reducir el riesgo de paquetes obsoletos
- `init_project_context` genera documentos base de grafo bajo `docs/graph-insights/`
- `start_feature` y `start_bugfix` refrescan el índice de GitNexus y usan pistas de grafo por tarea
- Si GitNexus no está disponible, el servidor hace fallback automático sin romper la orquestación

### 🐛 RCA TBP de 8 pasos para flujos de bugs

- `start_bugfix` usa por defecto un análisis de causa raíz TBP de 8 pasos antes de reparar
- `fix_bug` devuelve una estructura TBP con fenómeno, línea de tiempo, caminos descartados, frontera, causa raíz, evidencia y plan de reparación

### 🧠 Recuperación de memoria y Cursor History

- Las herramientas de memoria usan **Qdrant** como base de datos vectorial
- Modos de embedding soportados:
  - `ollama`
  - `openai-compatible`
- Las herramientas de Cursor history leen la base de datos local de Cursor directamente con Node.js
- Cursor history soporta actualmente Windows, macOS y Linux

**Herramientas de memoria:**
- `memorize_asset` - Persistir activos reutilizables de código/spec/patrones en memoria vectorial
- `read_memory_asset` - Leer contenido completo del activo por `asset_id`
- `scan_and_extract_patterns` - Extraer patrones reutilizables desde código/archivo/directorio

**Variables de entorno clave para memoria:**
- `MEMORY_QDRANT_URL`
- `MEMORY_EMBEDDING_URL`
- `MEMORY_EMBEDDING_MODEL`
- opcionales: `MEMORY_QDRANT_API_KEY`, `MEMORY_QDRANT_COLLECTION`, `MEMORY_EMBEDDING_API_KEY`, `MEMORY_EMBEDDING_PROVIDER`

### 🎯 Salida estructurada

Las herramientas núcleo y de orquestación soportan **salida estructurada**, devolviendo JSON legible por máquina para mejorar el encadenamiento de herramientas y el seguimiento de estado.

Para más detalles sobre instalación, GitNexus, configuración de memoria y todos los flujos, consulte la [documentación completa en inglés](../README.md) o visite [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/).

---

## 🚀 Instalación Rápida

### Método 1: Uso directo con npx (Recomendado)

**Configuración Cursor / Cline:**
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

**Configuración Claude Desktop:**
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

### Método 2: Instalación Global

```bash
npm install -g mcp-probe-kit
```

### Nota de Windows para herramientas de grafo

Aplica a `code_insight`, `start_feature`, `start_bugfix` e `init_project_context`.

- GitNexus Bridge usa `npx -y gitnexus@latest mcp` por defecto.
- En Windows, el primer arranque en frío puede tardar más de 20 segundos.
- Algunas dependencias de GitNexus usan módulos nativos `tree-sitter-*` y pueden requerir Visual Studio Build Tools.

Recomendaciones en Windows:

1. Instala Visual Studio Build Tools con la carga de trabajo de C++.
2. Si tu cliente MCP soporta `env`, prioriza una CLI `gitnexus` preinstalada.
3. En equipos lentos, aumenta los timeouts de conexión y llamada de GitNexus.

Instalación rápida (Windows):

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

---

## 💡 Ejemplos de Uso

```bash
# Desarrollo diario
code_review @feature.ts
gentest @feature.ts
gencommit

# Desarrollo de nuevas características
start_feature user-auth "Función de autenticación de usuario"

# Corrección de errores
start_bugfix

# Diseño de producto
start_product "Plataforma de educación en línea" --product_type=SaaS

# Desarrollo UI
start_ui "Página de inicio de sesión" --mode=auto
```

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

---

**Made with ❤️ for AI-Powered Development**
