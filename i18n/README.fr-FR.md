# mcp-probe-kit — Connaître le Contexte, Nourrir le Moment

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
> mcp-probe-kit est une boîte à outils au niveau protocole conçue pour les développeurs qui veulent que l'IA comprenne vraiment l'intention de leur projet. Ce n'est pas seulement une collection de 29 outils — c'est un système conscient du contexte qui aide les agents IA à saisir ce que vous construisez.

**Langues**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Español](README.es-ES.md) | **Français** | [Deutsch](README.de-DE.md) | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 Boîte à Outils de Développement Complète Alimentée par l'IA - Couvrant l'Ensemble du Cycle de Vie du Développement

Un puissant serveur MCP (Model Context Protocol) fournissant **29 outils** couvrant le flux de travail complet de l'analyse produit au lancement final (Exigences → Conception → Développement → Qualité → Lancement), tous les outils supportent la **sortie structurée**.

**🎉 Mise à Jour Majeure v3.0** : Nombre d'outils simplifié, focus sur les compétences clés, élimination de la paralysie du choix, permettant à l'IA de faire plus de travail natif

**Supporte Tous les Clients MCP** : Cursor, Claude Desktop, Cline, Continue, et plus

**Version du Protocole** : MCP 2025-11-25 · **SDK** : @modelcontextprotocol/sdk 1.27.1

---

## 📚 Documentation Complète

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Démarrage Rapide](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Configuration en 5 minutes
- [Tous les Outils](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Liste complète de 29 outils
- [Meilleures Pratiques](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Guide complet du flux de travail de développement
- [Guide de Migration v3.0](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Mise à niveau de v2.x vers v3.0

---

## ✨ Fonctionnalités Principales

### 📦 29 Outils

- **🔄 Orchestration des Flux de Travail** (6 outils) - Flux de travail de développement complexes en un clic
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Analyse de Code** (4 outils) - Qualité du code, refactorisation et insight de graphe
  - `code_review`, `code_insight`, `fix_bug`, `refactor`
- **📝 Outils Git** (2 outils) - Commits Git et rapports de travail
  - `gencommit`, `git_work_report`
- **⚡ Génération de Code** (1 outil) - Génération de tests
  - `gentest`
- **📦 Gestion de Projet** (7 outils) - Initialisation, exigences et validation de spec
  - `init_project`, `init_project_context`, `add_feature`, `check_spec`, `estimate`, `interview`, `ask_user`
- **🎨 Utilitaires UI/UX** (3 outils) - Systèmes de conception et synchronisation des données UI
  - `ui_design_system`, `ui_search`, `sync_ui_data`
- **🧠 Mémoire** (6 outils) - Mémoire d'actifs réutilisables
  - `search_memory`, `read_memory_asset`, `memorize_asset`, `update_memory_asset`, `delete_memory_asset`, `scan_and_extract_patterns`

### 🧠 Pont de Graphe de Code (GitNexus)

- `code_insight` fait le pont avec GitNexus par défaut pour l'analyse query/context/impact
- Le pont lance `npx -y gitnexus@latest mcp` par défaut pour réduire le risque de paquets obsolètes
- `init_project_context` initialise les documents de graphe de base sous `docs/graph-insights/` ; si `docs/project-context.md` existe déjà, il préserve les anciens documents de contexte et ne remplit que les documents de graphe plus l'entrée d'index
- `start_feature` rafraîchit l'index GitNexus et exécute le resserrement query/context/impact au niveau tâche avant la génération de spec
- `start_bugfix` rafraîchit l'index GitNexus et exécute l'analyse de graphe au niveau tâche avant le RCA TBP
- Les anciens projets qui ont déjà `project-context.md` mais pas de documents de graphe sont initialisés automatiquement via `init_project_context`
- Si GitNexus est indisponible, le serveur bascule automatiquement sans interrompre l'orchestration
- Les requêtes de graphe réelles lisent l'index `.gitnexus` ; `docs/graph-insights/latest.md|json` sont des snapshots lisibles
- Les snapshots de graphe sont exposés en ressources MCP : Cursor n’affiche que **2 entrées** (`probe://status`, `probe://graph/latest`) ; `latest` inclut l’historique et l’index des fichiers. Les URI à la demande (`probe://graph/history`, `probe://graph/latest.md`, `probe://graph/files`) restent lisibles via `resources/read`
- Les snapshots sont persistés dans `.mcp-probe-kit/graph-snapshots` (personnalisable via `MCP_GRAPH_SNAPSHOT_DIR`)
- Les réponses des outils incluent `_meta.graph` avec l'URI du snapshot et les chemins locaux

### 🐛 RCA TBP en 8 Étapes pour les Workflows de Bug

- `start_bugfix` applique par défaut une analyse de cause racine Toyota TBP en 8 étapes avant la réparation
- `fix_bug` retourne un squelette TBP structuré couvrant le phénomène, la chronologie, les chemins exclus, la frontière, la cause racine, les preuves et le plan de réparation
- Cela impose une discipline d'analyse préalable plutôt que de corriger les symptômes

### 🧠 Récupération Mémoire

- Les outils mémoire utilisent **Qdrant** comme backend de base de données vectorielle
- Le service d'embedding supporte deux modes : `ollama` et `openai-compatible`

**Outils mémoire :**
- `search_memory` - Recherche sémantique dans le pool partagé
- `memorize_asset` - Persister des actifs réutilisables dans la mémoire vectorielle
- `read_memory_asset` - Lire le contenu complet d'un actif par `asset_id`
- `update_memory_asset` - Mettre à jour un actif existant par `asset_id` (conserve l'ID)
- `delete_memory_asset` - Supprimer un actif par `asset_id`
- `scan_and_extract_patterns` - Extraire des patterns réutilisables

**Configuration mémoire locale recommandée (Qdrant + Ollama) :**
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

**Configuration d'embedding compatible OpenAI :**
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

### 🎯 Sortie Structurée

Les outils cœur et d'orchestration supportent la **sortie structurée**, retournant des données JSON lisibles par machine.

### ⏱️ Tâches Natives, Progression et Annulation

- Basé sur le support de tâches natif du SDK MCP (`taskStore` + `taskMessageQueue`)
- Supporte les endpoints : `tasks/get`, `tasks/result`, `tasks/list`, `tasks/cancel`
- Annonce `capabilities.tasks.requests.tools.call`
- Émet `notifications/progress` quand le client fournit `_meta.progressToken`
- Gère l'annulation via `AbortSignal`
- Les outils longue durée (`start_*`) et `sync_ui_data` supportent l'annulation coopérative

### 🔌 Extensions et UI Apps (Optionnel)

- Trace metadata passthrough : `_meta.trace` préservé dans les réponses
- Interrupteur d'extensions : `MCP_ENABLE_EXTENSIONS_CAPABILITY=1`
- Sortie UI Apps : `MCP_ENABLE_UI_APPS=1`
- Les outils UI exposent des ressources via `ui://...` et `_meta.ui.resourceUri`

### 🧭 Protocole d'Orchestration Déléguée

Tous les outils `start_*` retournent un **plan d'exécution** dans `structuredContent.metadata.plan`. L'IA doit **appeler les outils étape par étape et persister les fichiers**.

**Schéma du Plan :**
```json
{
  "mode": "delegated",
  "steps": [
    {
      "id": "spec",
      "tool": "add_feature",
      "args": { "feature_name": "user-auth", "description": "Fonctionnalité d'authentification" },
      "outputs": ["docs/specs/user-auth/requirements.md"]
    }
  ]
}
```

### 🧩 Spécification des Champs de Sortie Structurée

- `summary` : Résumé en une ligne
- `status` : État (pending/success/failed/partial)
- `steps` : Étapes d'exécution (outils d'orchestration)
- `artifacts` : Liste d'artifacts
- `metadata.plan` : Plan d'exécution déléguée (start_* uniquement)
- `specArtifacts` : Artifacts de spécification (start_feature)
- `estimate` : Résultats d'estimation (start_feature / estimate)

### 🧠 Mode de Clarification des Exigences (Requirements Loop)

Utilisez `requirements_mode=loop` dans `start_feature / start_bugfix / start_ui` pour 1-2 tours de clarification structurée avant l'exécution.

```json
{
  "feature_name": "user-auth",
  "description": "Fonctionnalité d'authentification utilisateur",
  "requirements_mode": "loop",
  "loop_max_rounds": 2,
  "loop_question_budget": 5
}
```

### 🧩 Système de Templates

`add_feature` supporte les profils de template : `guided` (exigences incomplètes), `strict` (exigences complètes), `auto` (sélection automatique).

```json
{
  "description": "Ajouter l'authentification utilisateur",
  "template_profile": "auto"
}
```

### 🔄 Orchestration des Flux de Travail

6 outils d'orchestration :
- `start_feature` - Nouvelle fonctionnalité (Exigences → Conception → Estimation)
- `start_bugfix` - Correction de bug (RCA TBP 8 étapes → Correction → Tests)
- `start_onboard` - Intégration projet
- `start_ui` - Développement UI (Système de conception → Composants → Code)
- `start_product` - Conception produit (PRD → Prototype → HTML)
- `start_ralph` - Ralph Loop (Développement itératif)

### 🚀 Flux de Conception Produit

`start_product` : des exigences au prototype interactif. Étapes : Analyse des Exigences → Prototype → Système de Conception → HTML → Contexte Projet.

### 🎨 UI/UX Pro Max

Outils UI/UX avec `start_ui` comme entrée unifiée :
- `start_ui` - Développement UI en un clic
- `ui_design_system` - Génération de système de conception
- `ui_search` - Recherche de données UI/UX (BM25)
- `sync_ui_data` - Synchroniser les données UI/UX

**Skill Bridge pour les flux UI/PRD :**
- `start_ui` et `start_product` incluent désormais une section Skill Bridge
- Ordre recommandé : `ui-ux-pro-max` → `interaction-design` → `frontend-design`

**Inspiration :**
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [json-render](https://github.com/vercel-labs/json-render)

### 🎤 Interview des Exigences

- `interview` - Interview structurée des exigences
- `ask_user` - Question proactive de l'IA

---

## 🧭 Guide de Sélection des Outils

| Scénario | Outil Recommandé | Raison |
|---------|-----------------|--------|
| Nouvelle fonctionnalité (flux complet) | `start_feature` | Auto-complète : spec → estimation |
| Seulement docs de spec | `add_feature` | Plus léger |
| Correction de bug (flux complet) | `start_bugfix` | RCA TBP → correction → test |
| Seulement analyse de bug | `fix_bug` | RCA TBP 8 étapes uniquement |
| Générer système de conception | `ui_design_system` | Génération directe |
| Développer composants UI | `start_ui` | Flux complet |
| Conception produit | `start_product` | PRD → prototype → HTML |
| Analyse d'exigence | `init_project` | Docs de spec complets |
| Docs d'intégration projet | `init_project_context` | Stack technique/architecture |

---

## 🚀 Démarrage Rapide

### Méthode 1 : npx (Recommandé)

#### Configuration Cursor / Cline

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

#### Configuration Claude Desktop

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

#### Configuration OpenCode

**Emplacement :** `opencode.json` (projet) ou `~/.config/opencode/opencode.json` (global)

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

> **Note :** OpenCode utilise `opencode.json` avec un schéma différent. `mcp` remplace `mcpServers`, `command` est un tableau, `type: "local"` requis, variables d'environnement via `environment`. Voir [OpenCode MCP docs](https://opencode.ai/docs/mcp).

### Méthode 2 : Installation Globale

```bash
npm install -g mcp-probe-kit
```

### Configuration Optionnelle du Système de Mémoire

#### Option A : Qdrant + Ollama

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

#### Option B : Qdrant + OpenAI-Compatible

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

### Variables d'Environnement de Mémoire

- `MEMORY_QDRANT_URL` : URL Qdrant (requis)
- `MEMORY_QDRANT_API_KEY` : Clé API Qdrant (optionnel)
- `MEMORY_QDRANT_COLLECTION` : Nom de collection (défaut `mcp_probe_memory`)
- `MEMORY_EMBEDDING_PROVIDER` : `ollama` ou `openai-compatible`
- `MEMORY_EMBEDDING_URL` : URL de l'endpoint d'embedding
- `MEMORY_EMBEDDING_API_KEY` : Clé API embedding
- `MEMORY_EMBEDDING_MODEL` : Modèle (défaut `nomic-embed-text`)
- `MEMORY_SEARCH_LIMIT` : Résultats (défaut `3`)
- `MEMORY_SUMMARY_MAX_CHARS` : Troncation (défaut `280`)

### Notes Windows pour les Outils de Graphe

- GitNexus utilise `npx -y gitnexus@latest mcp` par défaut. Premier démarrage à froid : 20+ secondes.
- Certaines dépendances (`tree-sitter-*`) nécessitent Visual Studio Build Tools.

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

Exemple avec gitnexus préinstallé :

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

### Redémarrer le Client

Après configuration, **quittez complètement et rouvrez** votre client MCP.

---

## 💡 Exemples d'Utilisation

```bash
# Développement quotidien
code_review @feature.ts
gentest @feature.ts
gencommit

# Nouvelle fonctionnalité
start_feature user-auth "Authentification utilisateur"

# Correction de bug
start_bugfix

# Conception produit
start_product "Plateforme d'éducation en ligne" --product_type=SaaS

# Développement UI
start_ui "Page de connexion" --mode=auto

# Contexte projet (module unique)
init_project_context

# Contexte projet (modulaire)
init_project_context --mode=modular

# Rapport Git quotidien
git_work_report --date 2026-02-03

# Rapport Git hebdomadaire
git_work_report --start_date 2026-02-01 --end_date 2026-02-07
```

---

## ❓ FAQ

### Q1 : L'outil ne fonctionne pas ?

```bash
npx -y mcp-probe-kit@latest 2>&1 | tee ./mcp-probe-kit.log
```

### Q2 : Client ne reconnaît pas les outils ?

1. Redémarrez le client
2. Vérifiez le chemin du fichier de configuration
3. Vérifiez la syntaxe JSON

### Q3 : Comment mettre à jour ?

**npx :** utilisez `@latest`. **Global :** `npm update -g mcp-probe-kit`

### Q4 : Pourquoi les outils de graphe sont lents sous Windows ?

Cause : `npx -y gitnexus@latest mcp` (démarrage à froid) + modules natifs `tree-sitter-*`.

Solution :
1. Installez Visual Studio Build Tools avec C++
2. Si le client supporte `env`, utilisez une CLI `gitnexus` préinstallée et augmentez `MCP_GITNEXUS_CONNECT_TIMEOUT_MS` / `MCP_GITNEXUS_TIMEOUT_MS`

---

## 🤝 Contribution

Issues et Pull Requests sont les bienvenus !

---

## 📄 Licence

MIT License

---

## 🔗 Liens

- **Auteur** : [Kyle (小墨)](https://www.bytezonex.com/)
- **GitHub** : [mcp-probe-kit](https://github.com/mybolide/mcp-probe-kit)
- **npm** : [mcp-probe-kit](https://www.npmjs.com/package/mcp-probe-kit)
- **Documentation** : [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)

**Projets connexes :**
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
- [GitHub Spec-Kit](https://github.com/github/spec-kit)
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)
- [json-render](https://github.com/vercel-labs/json-render)
- [uipro-cli](https://www.npmjs.com/package/uipro-cli)

---

**Made with ❤️ for AI-Powered Development**