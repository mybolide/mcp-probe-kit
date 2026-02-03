# MCP Probe Kit

**言語**: [English](../README.md) | [简体中文](README.zh-CN.md) | **日本語** | [한국어](README.ko-KR.md) | [Español](README.es-ES.md) | [Français](README.fr-FR.md) | [Deutsch](README.de-DE.md) | [Português (BR)](README.pt-BR.md)

[![npm version](https://img.shields.io/npm/v/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![npm downloads](https://img.shields.io/npm/dm/mcp-probe-kit.svg)](https://www.npmjs.com/package/mcp-probe-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/mybolide/mcp-probe-kit.svg)](https://github.com/mybolide/mcp-probe-kit/stargazers)

> 🚀 AI駆動の完全開発ツールキット - 開発ライフサイクル全体をカバー

強力な MCP (Model Context Protocol) サーバーで、製品分析から最終リリースまでの完全なワークフロー（要件 → 設計 → 開発 → 品質 → リリース）をカバーする **21のツール** を提供します。すべてのツールが**構造化出力**をサポートしています。

**🎉 v3.0 メジャーアップデート**: ツール数を整理し、コア機能に集中、選択の迷いを解消し、AIにより多くのネイティブ作業を実行させます

**すべてのMCPクライアントをサポート**: Cursor、Claude Desktop、Cline、Continueなど

**プロトコルバージョン**: MCP 2025-11-25 · **SDK**: @modelcontextprotocol/sdk 1.25.3

---

## 📚 完全なドキュメント

**👉 [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)**

- [クイックスタート](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html) - 5分でセットアップ
- [全ツール](https://mcp-probe-kit.bytezonex.com/pages/all-tools.html) - 21ツールの完全リスト
- [ベストプラクティス](https://mcp-probe-kit.bytezonex.com/pages/examples.html) - 完全な開発ワークフローガイド
- [v3.0 移行ガイド](https://mcp-probe-kit.bytezonex.com/pages/migration.html) - v2.xからv3.0へのアップグレード

---

## ✨ コア機能

### 📦 21のツール

- **🔄 ワークフローオーケストレーション** (6ツール) - ワンクリックで複雑な開発ワークフロー
  - `start_feature`, `start_bugfix`, `start_onboard`, `start_ui`, `start_product`, `start_ralph`
- **🔍 コード分析** (3ツール) - コード品質とリファクタリング
  - `code_review`, `fix_bug`, `refactor`
- **📝 Gitツール** (2ツール) - Gitコミットと作業レポート
  - `gencommit`, `git_work_report`
- **⚡ コード生成** (1ツール) - テスト生成
  - `gentest`
- **📦 プロジェクト管理** (7ツール) - プロジェクト初期化と要件管理
  - `init_project`, `init_project_context`, `add_feature`, `estimate`, `interview`, `ask_user`
- **🎨 UI/UXツール** (3ツール) - デザインシステムとデータ同期
  - `ui_design_system`, `ui_search`, `sync_ui_data`

### 🎯 構造化出力

コアおよびオーケストレーションツールは**構造化出力**をサポートし、機械可読なJSONデータを返すことで、AI解析の精度を向上させ、ツールチェーンと状態追跡をサポートします。

### 🧭 委譲オーケストレーションプロトコル

すべての `start_*` オーケストレーションツールは、`structuredContent.metadata.plan` に**実行計画**を返します。  
AIは**ステップごとにツールを呼び出してファイルを永続化する**必要があり、ツールが内部で直接実行するわけではありません。

**プランスキーマ（コアフィールド）**:
```json
{
  "mode": "delegated",
  "steps": [
    {
      "id": "spec",
      "tool": "add_feature",
      "args": { "feature_name": "user-auth", "description": "ユーザー認証機能" },
      "outputs": ["docs/specs/user-auth/requirements.md"]
    }
  ]
}
```

**フィールド説明**:
- `mode`: `delegated` に固定
- `steps`: 実行ステップの配列
- `tool`: ツール名（例：`add_feature`）
- `action`: ツールがない場合の手動アクション説明（例：`update_project_context`）
- `args`: ツールパラメータ
- `outputs`: 期待される成果物
- `when/dependsOn/note`: オプションの条件と注記

### 🧩 構造化出力フィールド仕様（主要フィールド）

オーケストレーションツールとアトミックツールの両方が `structuredContent` を返し、共通フィールド：
- `summary`: 一行要約
- `status`: ステータス（pending/success/failed/partial）
- `steps`: 実行ステップ（オーケストレーションツール）
- `artifacts`: 成果物リスト（パス + 目的）
- `metadata.plan`: 委譲実行計画（start_*のみ）
- `specArtifacts`: 仕様成果物（start_feature）
- `estimate`: 見積もり結果（start_feature / estimate）

### 🧠 要件明確化モード（Requirements Loop）

要件が不明確な場合、`start_feature / start_bugfix / start_ui` で `requirements_mode=loop` を使用します。  
このモードは、仕様/修正/UI実行フローに入る前に1〜2ラウンドの構造化された明確化を実行します。

**例：**
```json
{
  "feature_name": "user-auth",
  "description": "ユーザー認証機能",
  "requirements_mode": "loop",
  "loop_max_rounds": 2,
  "loop_question_budget": 5
}
```

### 🧩 テンプレートシステム（通常モデルフレンドリー）

`add_feature` はテンプレートプロファイルをサポートし、デフォルトの `auto` は自動選択：要件が不完全な場合は `guided`（詳細な記入ルールとチェックリストを含む）を優先し、要件が完全な場合は `strict`（よりコンパクトな構造、高機能モデルまたはアーカイブシナリオに適している）を選択します。

**例：**
```json
{
  "description": "ユーザー認証機能を追加",
  "template_profile": "auto"
}
```

**適用ツール**：
- `start_feature` は `template_profile` を `add_feature` に渡します
- `start_bugfix` / `start_ui` も `template_profile` をサポートし、ガイダンスの強度を制御します（auto/guided/strict）

**テンプレートプロファイル戦略**：
- `guided`: 要件情報が少ない/不完全、通常モデル優先
- `strict`: 要件が構造化されている、よりコンパクトなガイダンスを希望
- `auto`: デフォルト推奨、guided/strictを自動選択

### 🔄 ワークフローオーケストレーション

6つのインテリジェントオーケストレーションツールが、複数の基本ツールを自動的に組み合わせて、ワンクリックで複雑な開発ワークフローを完了します：
- `start_feature` - 新機能開発（要件 → 設計 → 見積もり）
- `start_bugfix` - バグ修正（分析 → 修正 → テスト）
- `start_onboard` - プロジェクトオンボーディング（プロジェクトコンテキストドキュメント生成）
- `start_ui` - UI開発（デザインシステム → コンポーネント → コード）
- `start_product` - 製品設計（PRD → プロトタイプ → デザインシステム → HTML）
- `start_ralph` - Ralph Loop（目標完了まで反復開発）

### 🚀 製品設計ワークフロー

`start_product` は、要件からインタラクティブプロトタイプまでの完全な製品設計オーケストレーションツールです：

**ワークフロー：**
1. **要件分析** - 標準PRD生成（製品概要、機能要件、ページリスト）
2. **プロトタイプ設計** - 各ページの詳細なプロトタイプドキュメント生成
3. **デザインシステム** - 製品タイプに基づいてデザイン仕様を生成
4. **HTMLプロトタイプ** - ブラウザで直接表示できるインタラクティブプロトタイプを生成
5. **プロジェクトコンテキスト** - プロジェクトドキュメントを自動更新

**構造化出力の追加**：
- `start_product.structuredContent.artifacts`: 成果物リスト（PRD、プロトタイプ、デザインシステムなど）
- `interview.structuredContent.mode`: `usage` / `questions` / `record`

### 🎨 UI/UX Pro Max

3つのUI/UXツール、`start_ui` が統一エントリポイント：
- `start_ui` - ワンクリックUI開発（インテリジェントモードサポート）（オーケストレーションツール）
- `ui_design_system` - インテリジェントデザインシステム生成
- `ui_search` - UI/UXデータ検索（BM25アルゴリズム）
- `sync_ui_data` - 最新のUI/UXデータをローカルに同期

**注意**: `start_ui` は自動的に `ui_design_system` と `ui_search` を呼び出すため、個別に呼び出す必要はありません。

**インスピレーション：**
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) - UI/UXデザインシステムの哲学
- [json-render](https://github.com/vercel-labs/json-render) - JSONテンプレートレンダリングエンジン

**なぜ `sync_ui_data` を使用するのか？**

私たちの `start_ui` ツールは、高品質なデザインシステムとコードを生成するために、豊富なUI/UXデータベース（色、アイコン、チャート、コンポーネント、デザインパターンなど）に依存しています。このデータは npm パッケージ [uipro-cli](https://www.npmjs.com/package/uipro-cli) から提供され、以下を含みます：
- 🎨 カラースキーム（主流ブランドカラー、カラーパレット）
- 🔣 アイコンライブラリ（React Icons、Heroiconsなど）
- 📊 チャートコンポーネント（Recharts、Chart.jsなど）
- 🎯 ランディングページテンプレート（SaaS、eコマース、政府など）
- 📐 デザイン仕様（スペーシング、フォント、シャドウなど）

**データ同期戦略：**
1. **埋め込みデータ**: ビルド時に同期、オフライン利用可能
2. **キャッシュデータ**: ランタイムで `~/.mcp-probe-kit/ui-ux-data/` に更新
3. **手動同期**: `sync_ui_data` を使用して最新データを強制更新

これにより、オフライン環境でも `start_ui` がプロフェッショナルグレードのUIコードを生成できることが保証されます。

### 🎤 要件インタビュー

開発前に要件を明確にするための2つのインタビューツール：
- `interview` - 構造化要件インタビュー
- `ask_user` - AIプロアクティブ質問

---

## 🧭 ツール選択ガイド

### オーケストレーションツールと個別ツールをいつ使用するか？

**オーケストレーションツール（start_*）を使用する場合：**
- ✅ 完全なワークフローが必要（複数のステップ）
- ✅ 複数のタスクを自動化したい
- ✅ 複数の成果物を生成する必要がある（ドキュメント、コード、テストなど）

**個別ツールを使用する場合：**
- ✅ 特定の機能のみが必要
- ✅ すでにプロジェクトコンテキストドキュメントがある
- ✅ より細かい制御が必要

### 一般的なシナリオの選択

| シナリオ | 推奨ツール | 理由 |
|---------|-----------|------|
| 新機能開発（完全フロー） | `start_feature` | 自動完了：仕様→見積もり |
| 機能仕様ドキュメントのみ必要 | `add_feature` | より軽量、ドキュメントのみ生成 |
| バグ修正（完全フロー） | `start_bugfix` | 自動完了：分析→修正→テスト |
| バグ分析のみ必要 | `fix_bug` | より高速、問題分析のみ |
| デザインシステム生成 | `ui_design_system` | デザイン仕様を直接生成 |
| UIコンポーネント開発 | `start_ui` | 完全フロー：デザイン→コンポーネント→コード |
| 製品設計（要件からプロトタイプまで） | `start_product` | ワンクリック：PRD→プロトタイプ→HTML |
| 一文要件分析 | `init_project` | 完全なプロジェクト仕様ドキュメント生成 |
| プロジェクトオンボーディングドキュメント | `init_project_context` | 技術スタック/アーキテクチャ/規約生成 |

---

## 🚀 クイックスタート

### 方法1: npxで直接使用（推奨）

インストール不要、最新バージョンを直接使用。

#### Cursor / Cline 設定

**設定ファイルの場所：**
- Windows: `%APPDATA%\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
- macOS: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
- Linux: `~/.config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

**設定内容：**
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

#### Claude Desktop 設定

**設定ファイルの場所：**
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**設定内容：**
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

### 方法2: グローバルインストール

```bash
npm install -g mcp-probe-kit
```

設定ファイルで使用：
```json
{
  "mcpServers": {
    "mcp-probe-kit": {
      "command": "mcp-probe-kit"
    }
  }
}
```

### クライアントを再起動

設定後、MCPクライアントを**完全に終了して再度開いて**ください。

**👉 [詳細なインストールガイド](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html)**

---

## 💡 使用例

### 日常開発
```bash
code_review @feature.ts    # コードレビュー
gentest @feature.ts         # テスト生成
gencommit                   # コミットメッセージ生成
```

### 新機能開発
```bash
start_feature user-auth "ユーザー認証機能"
# 自動完了：要件分析 → 設計 → 工数見積もり
```

### バグ修正
```bash
start_bugfix
# その後エラーメッセージを貼り付け
# 自動完了：問題特定 → 修正方法 → テストコード
```

### 製品設計
```bash
start_product "オンライン教育プラットフォーム" --product_type=SaaS
# 自動完了：PRD → プロトタイプ → デザインシステム → HTMLプロトタイプ
```

### UI開発
```bash
start_ui "ログインページ" --mode=auto
# 自動完了：デザインシステム → コンポーネント生成 → コード出力
```

### プロジェクトコンテキストドキュメント
```bash
# 単一ファイルモード（デフォルト）- 完全な project-context.md を生成
init_project_context

# モジュラーモード - 6つのカテゴリドキュメントを生成（大規模プロジェクトに適している）
init_project_context --mode=modular
# 生成：project-context.md（インデックス）+ 5つのカテゴリドキュメント
```

### Git作業レポート
```bash
# 日報生成
git_work_report --date 2026-02-03

# 週報生成
git_work_report --start_date 2026-02-01 --end_date 2026-02-07

# ファイルに保存
git_work_report --date 2026-02-03 --output_file daily-report.md
# Git diffを自動分析し、簡潔でプロフェッショナルなレポートを生成
# 直接コマンドが失敗した場合、一時スクリプトソリューションを自動提供（実行後自動削除）
```

**👉 [その他の使用例](https://mcp-probe-kit.bytezonex.com/pages/examples.html)**

---

## ❓ よくある質問

### Q1: ツールが動作しないまたはエラーが発生する場合は？

詳細ログを確認：

**Windows (PowerShell):**
```powershell
npx -y mcp-probe-kit@latest 2>&1 | Tee-Object -FilePath .\mcp-probe-kit.log
```

**macOS/Linux:**
```bash
npx -y mcp-probe-kit@latest 2>&1 | tee ./mcp-probe-kit.log
```

### Q2: 設定後にクライアントがツールを認識しない場合は？

1. **クライアントを再起動**（完全に終了してから再度開く）
2. 設定ファイルのパスが正しいか確認
3. JSON形式が正しく、構文エラーがないことを確認
4. クライアントの開発者ツールまたはログでエラーメッセージを確認

### Q3: 最新バージョンに更新するには？

**npx方式（推奨）:**
設定で `@latest` タグを使用すると、自動的に最新バージョンが使用されます。

**グローバルインストール方式:**
```bash
npm update -g mcp-probe-kit
```

**👉 [その他のよくある質問](https://mcp-probe-kit.bytezonex.com/pages/getting-started.html)**

---

## 🤝 貢献

IssueとPull Requestを歓迎します！

**改善提案：**
- 便利なツールを追加
- 既存ツールのプロンプトを最適化
- ドキュメントと例を改善
- バグ修正

---

## 📄 ライセンス

MIT License

---

## 🔗 関連リンク

- **著者**: [Kyle (小墨)](https://www.bytezonex.com/)
- **GitHub**: [mcp-probe-kit](https://github.com/mybolide/mcp-probe-kit)
- **npm**: [mcp-probe-kit](https://www.npmjs.com/package/mcp-probe-kit)
- **ドキュメント**: [https://mcp-probe-kit.bytezonex.com](https://mcp-probe-kit.bytezonex.com/)

**関連プロジェクト：**
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) - 公式MCPプロトコルドキュメント
- [GitHub Spec-Kit](https://github.com/github/spec-kit) - GitHub仕様駆動開発ツールキット
- [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) - UI/UXデザインシステム哲学のソース
- [json-render](https://github.com/vercel-labs/json-render) - JSONテンプレートレンダリングエンジンのインスピレーション
- [uipro-cli](https://www.npmjs.com/package/uipro-cli) - UI/UXデータソース

---

**Made with ❤️ for AI-Powered Development**
