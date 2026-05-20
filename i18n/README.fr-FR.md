<div align="center">
<img src="../docs/assets/logo.png" alt="知时MCP Logo" width="160"/>
<h1>知时MCP | mcp-probe-kit</h1>
<p><strong>Connaître le Contexte, Nourrir le Moment.</strong></p>
<p><code>Introspection</code> · <code>Context Hydration</code> · <code>Delegated Orchestration</code></p>
</div>

---

**Talk is cheap, show me the Context.**

> Zhishi MCP est une boîte à outils de sondage au niveau du protocole et d'approvisionnement en contexte conçue pour les geeks. Ce n'est pas seulement une collection de 28 outils, mais un système de perception qui permet à l'IA de vraiment "comprendre" l'intention de votre projet.

**Langues**: [English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Español](README.es-ES.md) | **Français** | [Deutsch](README.de-DE.md) | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 Boîte à Outils de Développement Complète Alimentée par l'IA - Couvrant l'Ensemble du Cycle de Vie du Développement

Un puissant serveur MCP (Model Context Protocol) fournissant **28 outils** couvrant le flux de travail complet de l'analyse produit au lancement final (Exigences → Conception → Développement → Qualité → Lancement), tous les outils supportent la **sortie structurée**.

**🎉 Mise à Jour Majeure v3.0**: Nombre d'outils simplifié, focus sur les compétences clés, élimination de la paralysie du choix, permettant à l'IA de faire plus de travail natif

**Supporte Tous les Clients MCP**: Cursor, Claude Desktop, Cline, Continue et plus

**Version du Protocole**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.27.1

---

## 📚 Documentation Complète

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [Démarrage Rapide](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - Configuration en 5 minutes
- [Tous les Outils](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - Liste complète de 28 outils
- [Meilleures Pratiques](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - Guide complet du flux de travail de développement
- [Guide de Migration v3.0](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - Mise à niveau de v2.x vers v3.0

---

## ✨ Fonctionnalités Principales

### 📦 28 Outils

- **🔄 Orchestration de Flux de Travail** (6 outils) - Flux de travail de développement complexes en un clic
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 Analyse de Code** (4 outils) - Qualité du code, refactorisation et graph insight
  - `code_review`, `code_insight`, `fix_bug`, `refactor`
- **📝 Outils Git** (2 outils) - Commits Git et rapports de travail
  - `gencommit`, `git_work_report`
- **⚡ Génération de Code** (1 outil) - Génération de tests
  - `gentest`
- **📦 Gestion de Projet** (6 outils) - Initialisation de projet et gestion des exigences
  - `init_project`, `init_project_context`, `add_feature`, `estimate`, `interview`, `ask_user`
- **🎨 Outils UI/UX** (3 outils) - Systèmes de conception et synchronisation des données UI
  - `ui_design_system`, `ui_search`, `sync_ui_data`
- **🧠 Memory & Cursor History** (6 outils) - Mémoire d’actifs réutilisables et lecture locale des conversations Cursor
  - `read_memory_asset`, `memorize_asset`, `scan_and_extract_patterns`, `cursor_list_conversations`, `cursor_search_conversations`, `cursor_read_conversation`

### 🧠 Pont de graphe de code (GitNexus)

- `code_insight` utilise GitNexus par défaut pour l’analyse query/context/impact
- Le bridge lance par défaut `npx -y gitnexus@latest mcp` afin de limiter le risque de paquets obsolètes
- `init_project_context` génère des documents de graphe de base sous `docs/graph-insights/`
- `start_feature` et `start_bugfix` rafraîchissent l’index GitNexus et exploitent des indices de graphe par tâche
- Si GitNexus est indisponible, le serveur applique un fallback automatique sans casser l’orchestration

### 🐛 RCA TBP en 8 étapes pour les workflows de bug

- `start_bugfix` applique par défaut une analyse de cause racine TBP en 8 étapes avant la réparation
- `fix_bug` renvoie une structure TBP couvrant phénomène, timeline, pistes exclues, frontière, cause racine, preuves et plan de correction

### 🧠 Récupération mémoire et Cursor History

- Les outils mémoire utilisent **Qdrant** comme base de données vectorielle
- Modes d’embedding supportés :
  - `ollama`
  - `openai-compatible`
- Les outils Cursor history lisent directement la base locale de Cursor via Node.js
- Cursor history prend actuellement en charge Windows, macOS et Linux

**Outils mémoire :**
- `memorize_asset` - Persister des actifs réutilisables de code/spec/pattern dans la mémoire vectorielle
- `read_memory_asset` - Lire le contenu complet d’un actif via `asset_id`
- `scan_and_extract_patterns` - Extraire des patterns réutilisables depuis du code/un fichier/un dossier

**Variables d’environnement clés pour la mémoire :**
- `MEMORY_QDRANT_URL`
- `MEMORY_EMBEDDING_URL`
- `MEMORY_EMBEDDING_MODEL`
- optionnelles : `MEMORY_QDRANT_API_KEY`, `MEMORY_QDRANT_COLLECTION`, `MEMORY_EMBEDDING_API_KEY`, `MEMORY_EMBEDDING_PROVIDER`

### 🎯 Sortie structurée

Les outils cœur et d’orchestration supportent la **sortie structurée** et renvoient du JSON lisible par machine pour améliorer le chaînage des outils et le suivi d’état.

Pour les détails complets sur l’installation, GitNexus, la configuration mémoire et tous les workflows, consultez la [documentation anglaise complète](../README.md) ou visitez [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/).

---

## 🚀 Installation Rapide

### Méthode 1: Utilisation directe avec npx (Recommandé)

**Configuration Cursor / Cline:**
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

**Configuration Claude Desktop:**
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

### Méthode 2: Installation Globale

```bash
npm install -g mcp-probe-kit
```

### Note Windows pour les outils de graphe

Concerne `code_insight`, `start_feature`, `start_bugfix` et `init_project_context`.

- Le bridge GitNexus utilise `npx -y gitnexus@latest mcp` par défaut.
- Sous Windows, le premier démarrage à froid peut prendre plus de 20 secondes.
- Certaines dépendances GitNexus utilisent des modules natifs `tree-sitter-*` et peuvent nécessiter Visual Studio Build Tools.

Recommandations sous Windows :

1. Installez Visual Studio Build Tools avec la charge de travail C++.
2. Si votre client MCP prend en charge `env`, privilégiez une CLI `gitnexus` préinstallée.
3. Sur les environnements lents, augmentez les timeouts de connexion/appel GitNexus.

Installation rapide (Windows) :

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
```

---

## 💡 Exemples d'Utilisation

```bash
# Développement quotidien
code_review @feature.ts
gentest @feature.ts
gencommit

# Développement de nouvelles fonctionnalités
start_feature user-auth "Fonctionnalité d'authentification utilisateur"

# Correction de bugs
start_bugfix

# Conception de produit
start_product "Plateforme d'éducation en ligne" --product_type=SaaS

# Développement UI
start_ui "Page de connexion" --mode=auto
```

---

## 🤝 Contribution

Les Issues et Pull Requests sont les bienvenues!

---

## 📄 Licence

MIT License

---

## 🔗 Liens

- **Auteur**: [Kyle (小墨)](https://www.bytezonex.com/)
- **GitHub**: [mcp-probe-kit](https://github.com/mybolide/mcp-probe-kit)
- **npm**: [mcp-probe-kit](https://www.npmjs.com/package/mcp-probe-kit)
- **Documentation**: [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)

---

**Made with ❤️ for AI-Powered Development**
