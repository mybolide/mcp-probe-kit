# mcp-probe-kit — Conheça o Contexto, Alimente o Momento

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
> mcp-probe-kit é um kit de ferramentas em nível de protocolo projetado para desenvolvedores que querem que a IA entenda verdadeiramente a intenção do seu projeto. Não é apenas uma coleção de 29 ferramentas — é um sistema consciente do contexto que ajuda os agentes de IA a compreender o que você está construindo.

**Idiomas**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Español](README.es-ES.md) | [Français](README.fr-FR.md) | [Deutsch](README.de-DE.md) | **Português (BR)**

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 Kit de Ferramentas de Desenvolvimento Completo Impulsionado por IA - Cobrindo Todo o Ciclo de Vida do Desenvolvimento

Um poderoso servidor MCP (Model Context Protocol) fornecendo **29 ferramentas** cobrindo o fluxo de trabalho completo da análise do produto ao lançamento final (Requisitos → Design → Desenvolvimento → Qualidade → Lançamento), todas as ferramentas suportam **saída estruturada**.

**🎉 Atualização Maior v3.0**: Número de ferramentas simplificado, foco em competências centrais, eliminação de paralisia de escolha, mais trabalho nativo para a IA

**Suporta Todos os Clientes MCP**: Cursor, Claude Desktop, Cline, Continue e mais

**Versão do Protocolo**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.27.1

---

## 📚 Documentação Completa

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Início Rápido](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Configuração em 5 minutos
- [Todas as Ferramentas](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Lista completa de 29 ferramentas
- [Melhores Práticas](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Guia completo do fluxo de trabalho
- [Guia de Migração v3.0](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Atualização de v2.x para v3.0

---

## ✨ Recursos Principais

### 📦 29 Ferramentas

- **🔄 Orquestração de Fluxos de Trabalho** (6 ferramentas) - Fluxos complexos com um clique
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Análise de Código** (4 ferramentas) - Qualidade, refatoração e graph insight
  - `code_review`, `code_insight`, `fix_bug`, `refactor`
- **📝 Ferramentas Git** (2 ferramentas) - Commits e relatórios de trabalho
  - `gencommit`, `git_work_report`
- **⚡ Geração de Código** (1 ferramenta) - Geração de testes
  - `gentest`
- **📦 Gerenciamento de Projetos** (7 ferramentas) - Inicialização, requisitos e validação de spec
  - `init_project`, `init_project_context`, `add_feature`, `check_spec`, `estimate`, `interview`, `ask_user`
- **🎨 Utilitários UI/UX** (3 ferramentas) - Sistemas de design e sincronização de dados
  - `ui_design_system`, `ui_search`, `sync_ui_data`
- **🧠 Memory** (6 ferramentas) - Memória de ativos reutilizáveis
  - `search_memory`, `read_memory_asset`, `memorize_asset`, `update_memory_asset`, `delete_memory_asset`, `scan_and_extract_patterns`

### 🧠 Ponte de Grafo de Código (GitNexus)

- `code_insight` usa GitNexus por padrão para análise query/context/impact
- A bridge inicia `npx -y gitnexus@latest mcp` por padrão
- `init_project_context` gera documentos base de grafo em `docs/graph-insights/`
- `start_feature` e `start_bugfix` atualizam o índice GitNexus
- Se GitNexus não estiver disponível, o servidor faz fallback automático
- Snapshots de grafo expostos como recursos (`probe://graph/latest`, etc.)
- Snapshots persistidos em `.mcp-probe-kit/graph-snapshots`

### 🐛 RCA TBP de 8 Etapas para Fluxos de Bug

- `start_bugfix` usa análise de causa raiz Toyota TBP de 8 etapas por padrão
- `fix_bug` retorna esqueleto TBP estruturado com fenômeno, linha do tempo, caminhos descartados, fronteira, causa raiz, evidências e plano de reparo

### 🧠 Recuperação de Memória

- Ferramentas de memória usam **Qdrant** como backend de banco vetorial
- Serviço de embedding suporta: `ollama` e `openai-compatible`

**Ferramentas de memória:**
- `search_memory` - Busca semântica no pool compartilhado
- `memorize_asset` - Persistir ativos reutilizáveis na memória vetorial
- `read_memory_asset` - Ler conteúdo completo por `asset_id`
- `update_memory_asset` - Atualizar ativo existente por `asset_id` (preserva ID)
- `delete_memory_asset` - Excluir ativo por `asset_id`
- `scan_and_extract_patterns` - Extrair padrões reutilizáveis

**Configuração local recomendada (Qdrant + Ollama):**
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

**Configuração de embedding compatível com OpenAI:**
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

### 🎯 Saída Estruturada

Ferramentas núcleo e de orquestração suportam **saída estruturada** com dados JSON legíveis por máquina.

### ⏱️ Tarefas Nativas, Progresso e Cancelamento

- Baseado no suporte nativo de tarefas do SDK MCP (`taskStore` + `taskMessageQueue`)
- Suporta endpoints: `tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel`
- Declara `capabilities.tasks.requests.tools.call`
- Emite `notifications/progress` com `_meta.progressToken`
- Trata cancelamento via `AbortSignal`
- Ferramentas de longa duração (`start_*`) e `sync_ui_data` suportam cancelamento cooperativo

### 🔌 Extensões e UI Apps (Opcional)

- Passagem de metadata de trace: `_meta.trace` preservado nas respostas
- Interruptor de extensões: `MCP_ENABLE_EXTENSIONS_CAPABILITY=1`
- Saída de recursos UI Apps: `MCP_ENABLE_UI_APPS=1`
- Ferramentas UI expõem recursos via `ui://...` e `_meta.ui.resourceUri`

### 🧭 Protocolo de Orquestração Delegada

Todas as ferramentas `start_*` retornam um **plano de execução** em `structuredContent.metadata.plan`. A IA deve **chamar ferramentas passo a passo e persistir arquivos**.

**Esquema do Plano:**
```json
{
  "mode": "delegated",
  "steps": [
    {
      "id": "spec",
      "tool": "add_feature",
      "args": { "feature_name": "user-auth", "description": "Autenticação de usuário" },
      "outputs": ["docs/specs/user-auth/requirements.md"]
    }
  ]
}
```

### 🧩 Especificação de Campos de Saída Estruturada

- `summary` : Resumo em uma linha
- `status` : Estado (pending/success/failed/partial)
- `steps` : Passos de execução (ferramentas de orquestração)
- `artifacts` : Lista de artefatos
- `metadata.plan` : Plano delegado (apenas start_*)
- `specArtifacts` : Artefatos de especificação (start_feature)
- `estimate` : Resultados de estimativa (start_feature / estimate)

### 🧠 Modo de Esclarecimento de Requisitos (Requirements Loop)

Use `requirements_mode=loop` em `start_feature / start_bugfix / start_ui` para 1-2 rodadas de esclarecimento estruturado.

```json
{
  "feature_name": "user-auth",
  "description": "Recurso de autenticação de usuário",
  "requirements_mode": "loop",
  "loop_max_rounds": 2,
  "loop_question_budget": 5
}
```

### 🧩 Sistema de Templates

`add_feature` suporta perfis de template: `guided` (requisitos incompletos), `strict` (completos), `auto` (seleção automática).

```json
{
  "description": "Adicionar autenticação de usuário",
  "template_profile": "auto"
}
```

### 🔄 Orquestração de Fluxos de Trabalho

6 ferramentas de orquestração:
- `start_feature` - Novo recurso (Requisitos → Design → Estimativa)
- `start_bugfix` - Correção de bug (RCA TBP 8 etapas → Correção → Testes)
- `start_onboard` - Integração ao projeto
- `start_ui` - Desenvolvimento UI (Sistema de design → Componentes → Código)
- `start_product` - Design de produto (PRD → Protótipo → HTML)
- `start_ralph` - Ralph Loop (Desenvolvimento iterativo)

### 🚀 Fluxo de Design de Produto

`start_product`: De requisitos ao protótipo interativo. Etapas: Análise → Protótipo → Sistema de Design → HTML → Contexto do Projeto.

### 🎨 UI/UX Pro Max

Ferramentas UI/UX com `start_ui` como entrada unificada:
- `start_ui` - Desenvolvimento UI em um clique
- `ui_design_system` - Geração de sistema de design
- `ui_search` - Busca de dados UI/UX (BM25)
- `sync_ui_data` - Sincronizar dados UI/UX

**Skill Bridge para fluxos UI/PRD:**
- `start_ui` e `start_product` incluem seção Skill Bridge
- Ordem recomendada: `ui-ux-pro-max` → `interaction-design` → `frontend-design`

**Inspiração:**
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [json-render](https://github.com/vercel-labs/json-render)

### 🎤 Entrevista de Requisitos

- `interview` - Entrevista estruturada de requisitos
- `ask_user` - Pergunta proativa da IA

---

## 🧭 Guia de Seleção de Ferramentas

| Cenário | Ferramenta | Razão |
|---------|-----------|------|
| Novo recurso (fluxo completo) | `start_feature` | Auto: Spec → Estimativa |
| Apenas docs de spec | `add_feature` | Mais leve |
| Correção de bug (fluxo completo) | `start_bugfix` | TBP RCA → Correção → Teste |
| Apenas análise de bug | `fix_bug` | RCA TBP 8 etapas |
| Gerar sistema de design | `ui_design_system` | Geração direta |
| Desenvolver componentes UI | `start_ui` | Fluxo completo |
| Design de produto | `start_product` | PRD → Protótipo → HTML |
| Análise de requisitos | `init_project` | Docs de spec completos |
| Docs de integração | `init_project_context` | Stack técnico/arquitetura |

---

## 🚀 Início Rápido

### Método 1: npx (Recomendado)

#### Configuração Cursor / Cline

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

#### Configuração Claude Desktop

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

#### Configuração OpenCode

**Localização:** `opencode.json` (projeto) ou `~/.config/opencode/opencode.json` (global)

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

> **Nota:** OpenCode usa `opencode.json` com esquema diferente. `mcp` substitui `mcpServers`, `command` é um array, `type: "local"` necessário, variáveis de ambiente via `environment`. Veja [OpenCode MCP docs](https://opencode.ai/docs/mcp).

### Método 2: Instalação Global

```bash
npm install -g mcp-probe-kit
```

### Configuração Opcional do Sistema de Memória

#### Opção A: Qdrant + Ollama

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

#### Opção B: Qdrant + Compatível com OpenAI

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

### Variáveis de Ambiente de Memória

- `MEMORY_QDRANT_URL` : URL Qdrant (obrigatório)
- `MEMORY_QDRANT_API_KEY` : Chave API Qdrant (opcional)
- `MEMORY_QDRANT_COLLECTION` : Coleção (padrão `mcp_probe_memory`)
- `MEMORY_EMBEDDING_PROVIDER` : `ollama` ou `openai-compatible`
- `MEMORY_EMBEDDING_URL` : URL do endpoint de embedding
- `MEMORY_EMBEDDING_API_KEY` : Chave API embedding
- `MEMORY_EMBEDDING_MODEL` : Modelo (padrão `nomic-embed-text`)
- `MEMORY_SEARCH_LIMIT` : Resultados (padrão `3`)
- `MEMORY_SUMMARY_MAX_CHARS` : Truncagem (padrão `280`)

### Notas do Windows para Ferramentas de Grafo

- GitNexus usa `npx -y gitnexus@latest mcp` por padrão. Primeira inicialização a frio: 20+ segundos.
- Algumas dependências (`tree-sitter-*`) exigem Visual Studio Build Tools.

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

Exemplo com gitnexus pré-instalado:

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

### Reiniciar o Cliente

Após a configuração, **feche completamente e reabra** seu cliente MCP.

---

## 💡 Exemplos de Uso

```bash
# Desenvolvimento diário
code_review @feature.ts
gentest @feature.ts
gencommit

# Novo recurso
start_feature user-auth "Recurso de autenticação de usuário"

# Correção de bug
start_bugfix

# Design de produto
start_product "Plataforma de educação online" --product_type=SaaS

# Desenvolvimento UI
start_ui "Página de login" --mode=auto

# Contexto do projeto (arquivo único)
init_project_context

# Contexto do projeto (modular)
init_project_context --mode=modular

# Relatório Git diário
git_work_report --date 2026-02-03

# Relatório Git semanal
git_work_report --start_date 2026-02-01 --end_date 2026-02-07
```

---

## ❓ FAQ

### Q1: A ferramenta não funciona?

```bash
npx -y mcp-probe-kit@latest 2>&1 | tee ./mcp-probe-kit.log
```

### Q2: Cliente não reconhece as ferramentas?

1. Reinicie o cliente
2. Verifique o caminho do arquivo de configuração
3. Verifique a sintaxe JSON

### Q3: Como atualizar?

**npx:** use `@latest`. **Global:** `npm update -g mcp-probe-kit`

### Q4: Por que as ferramentas de grafo estão lentas no Windows?

Causa: `npx -y gitnexus@latest mcp` (inicialização a frio) + módulos nativos `tree-sitter-*`.

Solução:
1. Instale Visual Studio Build Tools com C++
2. Se o cliente suportar `env`, use CLI `gitnexus` pré-instalada e aumente `MCP_GITNEXUS_CONNECT_TIMEOUT_MS` / `MCP_GITNEXUS_TIMEOUT_MS`

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

**Projetos relacionados:**
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [json-render](https://github.com/vercel-labs/json-render)
- [uipro-cli](https://www.npmjs.com/package/uipro-cli)

---

**Made with ❤️ for AI-Powered Development**