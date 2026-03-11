<div align="center">
<img src="../docs/assets/logo.png" alt="知时MCP Logo" width="160"/>
<h1>知时MCP | mcp-probe-kit</h1>
<p><strong>Conoce el Contexto, Alimenta el Momento.</strong></p>
<p><code>Introspection</code> · <code>Context Hydration</code> · <code>Delegated Orchestration</code></p>
</div>

---

**Talk is cheap, show me the Context.**

> Zhishi MCP es un kit de herramientas de sondeo a nivel de protocolo y suministro de contexto diseñado para geeks. No es solo una colección de 21 herramientas, sino un sistema de percepción que permite a la IA "comprender" verdaderamente la intención de tu proyecto.

**Idiomas**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | **Español** | [Français](README.fr-FR.md) | [Deutsch](README.de-DE.md) | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 Kit de Herramientas de Desarrollo Completo Impulsado por IA - Cubriendo Todo el Ciclo de Vida del Desarrollo

Un potente servidor MCP (Model Context Protocol) que proporciona **21 herramientas** que cubren el flujo de trabajo completo desde el análisis del producto hasta el lanzamiento final (Requisitos → Diseño → Desarrollo → Calidad → Lanzamiento), todas las herramientas soportan **salida estructurada**.

**🎉 Actualización Mayor v3.0**: Número de herramientas simplificado, enfoque en competencias centrales, eliminación de parálisis de elección, permitiendo que la IA haga más trabajo nativo

**Soporta Todos los Clientes MCP**: Cursor, Claude Desktop, Cline, Continue y más

**Versión del Protocolo**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.27.1

---

## 📚 Documentación Completa

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Inicio Rápido](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Configuración en 5 minutos
- [Todas las Herramientas](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Lista completa de 21 herramientas
- [Mejores Prácticas](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Guía completa del flujo de trabajo de desarrollo
- [Guía de Migración v3.0](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Actualización de v2.x a v3.0

---

## ✨ Características Principales

### 📦 21 Herramientas

- **🔄 Orquestación de Flujos de Trabajo** (6 herramientas) - Flujos de trabajo de desarrollo complejos con un clic
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Análisis de Código** (3 herramientas) - Calidad de código y refactorización
  - `code_review`, `fix_bug`, `refactor`
- **📝 Herramientas Git** (2 herramientas) - Commits Git e informes de trabajo
  - `gencommit`, `git_work_report`
- **⚡ Generación de Código** (1 herramienta) - Generación de pruebas
  - `gentest`
- **📦 Gestión de Proyectos** (7 herramientas) - Inicialización de proyectos y gestión de requisitos
  - `init_project`, `init_project_context`, `add_feature`, `estimate`, `interview`, `ask_user`
- **🎨 Herramientas UI/UX** (3 herramientas) - Sistemas de diseño y sincronización de datos
  - `ui_design_system`, `ui_search`, `sync_ui_data`

Para más detalles sobre características, instalación y uso, consulte la [documentación completa en inglés](../README.md) o visite [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/).

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
