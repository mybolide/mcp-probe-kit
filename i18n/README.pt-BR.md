<div align="center">
<img src="../docs/assets/logo.png" alt="知时MCP Logo" width="160"/>
<h1>知时MCP | mcp-probe-kit</h1>
<p><strong>Conheça o Contexto, Alimente o Momento.</strong></p>
<p><code>Introspection</code> · <code>Context Hydration</code> · <code>Delegated Orchestration</code></p>
</div>

---

**Talk is cheap, show me the Context.**

> Zhishi MCP é um kit de ferramentas de sondagem em nível de protocolo e fornecimento de contexto criado para geeks. Não é apenas uma coleção de 28 ferramentas, mas um sistema de percepção que permite à IA realmente "entender" a intenção do seu projeto.

**Idiomas**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Español](README.es-ES.md) | [Français](README.fr-FR.md) | [Deutsch](README.de-DE.md) | **Português (BR)**

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 Kit de Ferramentas de Desenvolvimento Completo Impulsionado por IA - Cobrindo Todo o Ciclo de Vida do Desenvolvimento

Um poderoso servidor MCP (Model Context Protocol) fornecendo **28 ferramentas** cobrindo o fluxo de trabalho completo desde a análise do produto até o lançamento final (Requisitos → Design → Desenvolvimento → Qualidade → Lançamento), todas as ferramentas suportam **saída estruturada**.

**🎉 Atualização Maior v3.0**: Número de ferramentas simplificado, foco em competências centrais, eliminação de paralisia de escolha, permitindo que a IA faça mais trabalho nativo

**Suporta Todos os Clientes MCP**: Cursor, Claude Desktop, Cline, Continue e mais

**Versão do Protocolo**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.27.1

---

## 📚 Documentação Completa

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Início Rápido](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Configuração em 5 minutos
- [Todas as Ferramentas](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Lista completa de 28 ferramentas
- [Melhores Práticas](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Guia completo do fluxo de trabalho de desenvolvimento
- [Guia de Migração v3.0](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Atualização de v2.x para v3.0

---

## ✨ Recursos Principais

### 📦 28 Ferramentas

- **🔄 Orquestração de Fluxos de Trabalho** (6 ferramentas) - Fluxos de trabalho de desenvolvimento complexos com um clique
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Análise de Código** (4 ferramentas) - Qualidade de código, refatoração e graph insight
  - `code_review`, `code_insight`, `fix_bug`, `refactor`
- **📝 Ferramentas Git** (2 ferramentas) - Commits Git e relatórios de trabalho
  - `gencommit`, `git_work_report`
- **⚡ Geração de Código** (1 ferramenta) - Geração de testes
  - `gentest`
- **📦 Gerenciamento de Projetos** (6 ferramentas) - Inicialização de projetos e gerenciamento de requisitos
  - `init_project`, `init_project_context`, `add_feature`, `estimate`, `interview`, `ask_user`
- **🎨 Ferramentas UI/UX** (3 ferramentas) - Sistemas de design e sincronização de dados de UI
  - `ui_design_system`, `ui_search`, `sync_ui_data`
- **🧠 Memory e Cursor History** (6 ferramentas) - Memória de ativos reutilizáveis e leitura local de conversas do Cursor
  - `read_memory_asset`, `memorize_asset`, `scan_and_extract_patterns`, `cursor_list_conversations`, `cursor_search_conversations`, `cursor_read_conversation`

### 🧠 Ponte de grafo de código (GitNexus)

- `code_insight` usa GitNexus por padrão para análises de query/context/impact
- A bridge inicia `npx -y gitnexus@latest mcp` por padrão para reduzir risco de pacote desatualizado
- `init_project_context` gera documentos base de grafo em `docs/graph-insights/`
- `start_feature` e `start_bugfix` atualizam o índice do GitNexus e usam pistas de grafo específicas da tarefa
- Se o GitNexus não estiver disponível, o servidor faz fallback automático sem quebrar a orquestração

### 🐛 RCA TBP de 8 etapas para fluxos de bug

- `start_bugfix` usa por padrão uma análise de causa raiz TBP de 8 etapas antes da correção
- `fix_bug` retorna uma estrutura TBP com fenômeno, linha do tempo, caminhos descartados, fronteira, causa raiz, evidências e plano de reparo

### 🧠 Recuperação de memória e Cursor History

- As ferramentas de memória usam **Qdrant** como banco vetorial
- Modos de embedding suportados:
  - `ollama`
  - `openai-compatible`
- As ferramentas de Cursor history leem o banco local do Cursor diretamente via Node.js
- Cursor history suporta atualmente Windows, macOS e Linux

**Ferramentas de memória:**
- `memorize_asset` - Persistir ativos reutilizáveis de código/spec/padrões na memória vetorial
- `read_memory_asset` - Ler o conteúdo completo do ativo por `asset_id`
- `scan_and_extract_patterns` - Extrair padrões reutilizáveis de código/arquivo/diretório

**Variáveis de ambiente chave para memória:**
- `MEMORY_QDRANT_URL`
- `MEMORY_EMBEDDING_URL`
- `MEMORY_EMBEDDING_MODEL`
- opcionais: `MEMORY_QDRANT_API_KEY`, `MEMORY_QDRANT_COLLECTION`, `MEMORY_EMBEDDING_API_KEY`, `MEMORY_EMBEDDING_PROVIDER`

### 🎯 Saída estruturada

Ferramentas centrais e de orquestração suportam **saída estruturada**, retornando JSON legível por máquina para melhorar encadeamento de ferramentas e rastreamento de estado.

Para detalhes completos sobre instalação, GitNexus, configuração de memória e todos os fluxos, consulte a [documentação completa em inglês](../README.md) ou visite [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/).

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

### Nota do Windows para ferramentas de grafo

Aplica-se a `code_insight`, `start_feature`, `start_bugfix` e `init_project_context`.

- A ponte do GitNexus usa `npx -y gitnexus@latest mcp` por padrão.
- No Windows, a primeira inicialização a frio pode levar mais de 20 segundos.
- Algumas dependências do GitNexus usam módulos nativos `tree-sitter-*` e podem exigir Visual Studio Build Tools.

Recomendações no Windows:

1. Instale o Visual Studio Build Tools com a carga de trabalho de C++.
2. Se seu cliente MCP suportar `env`, priorize uma CLI `gitnexus` já instalada.
3. Em ambientes mais lentos, aumente os timeouts de conexão/chamada do GitNexus.

Instalação rápida (Windows):

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
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
