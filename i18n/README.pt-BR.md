<div align="center">
  <img src="../docs/assets/logo.png" alt="MCP Probe Kit Logo" width="200"/>
  <h1>知时MCP (MCP Probe Kit)</h1>
  <p><em>知其境，馈其时。</em></p>
</div>

**Idiomas**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Español](README.es-ES.md) | [Français](README.fr-FR.md) | [Deutsch](README.de-DE.md) | **Português (BR)**

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 Kit de Ferramentas de Desenvolvimento Completo Impulsionado por IA - Cobrindo Todo o Ciclo de Vida do Desenvolvimento

Um poderoso servidor MCP (Model Context Protocol) fornecendo **21 ferramentas** cobrindo o fluxo de trabalho completo desde a análise do produto até o lançamento final (Requisitos → Design → Desenvolvimento → Qualidade → Lançamento), todas as ferramentas suportam **saída estruturada**.

**🎉 Atualização Maior v3.0**: Número de ferramentas simplificado, foco em competências centrais, eliminação de paralisia de escolha, permitindo que a IA faça mais trabalho nativo

**Suporta Todos os Clientes MCP**: Cursor, Claude Desktop, Cline, Continue e mais

**Versão do Protocolo**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.25.3

---

## 📚 Documentação Completa

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Início Rápido](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Configuração em 5 minutos
- [Todas as Ferramentas](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Lista completa de 21 ferramentas
- [Melhores Práticas](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Guia completo do fluxo de trabalho de desenvolvimento
- [Guia de Migração v3.0](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Atualização de v2.x para v3.0

---

## ✨ Recursos Principais

### 📦 21 Ferramentas

- **🔄 Orquestração de Fluxos de Trabalho** (6 ferramentas) - Fluxos de trabalho de desenvolvimento complexos com um clique
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Análise de Código** (3 ferramentas) - Qualidade de código e refatoração
  - `code_review`, `fix_bug`, `refactor`
- **📝 Ferramentas Git** (2 ferramentas) - Commits Git e relatórios de trabalho
  - `gencommit`, `git_work_report`
- **⚡ Geração de Código** (1 ferramenta) - Geração de testes
  - `gentest`
- **📦 Gerenciamento de Projetos** (7 ferramentas) - Inicialização de projetos e gerenciamento de requisitos
  - `init_project`, `init_project_context`, `add_feature`, `estimate`, `interview`, `ask_user`
- **🎨 Ferramentas UI/UX** (3 ferramentas) - Sistemas de design e sincronização de dados
  - `ui_design_system`, `ui_search`, `sync_ui_data`

Para mais detalhes sobre recursos, instalação e uso, consulte a [documentação completa em inglês](../README.md) ou visite [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/).

---

## 🚀 Instalação Rápida

### Método 1: Uso direto com npx (Recomendado)

**Configuração Cursor / Cline:**
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

**Configuração Claude Desktop:**
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

### Método 2: Instalação Global

```bash
npm install -g mcp-probe-kit
```

---

## 💡 Exemplos de Uso

```bash
# Desenvolvimento diário
code_review @feature.ts
gentest @feature.ts
gencommit

# Desenvolvimento de novos recursos
start_feature user-auth "Recurso de autenticação de usuário"

# Correção de bugs
start_bugfix

# Design de produto
start_product "Plataforma de educação online" --product_type=SaaS

# Desenvolvimento UI
start_ui "Página de login" --mode=auto
```

---

## 🤝 Contribuição

Issues e Pull Requests são bem-vindos!

---

## 📄 Licença

MIT License

---

## 🔗 Links

- **Autor**: [Kyle (小墨)](https://www.bytezonex.com/)
- **GitHub**: [mcp-probe-kit](https://github.com/mybolide/mcp-probe-kit)
- **npm**: [mcp-probe-kit](https://www.npmjs.com/package/mcp-probe-kit)
- **Documentação**: [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)

---

**Made with ❤️ for AI-Powered Development**
