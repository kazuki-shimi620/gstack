# gstack

gstackは、CLI First・AI First・Schema Firstなアプリケーションフレームワークです。宣言的なSchemaをProvider非依存の正規化されたApplication Modelへコンパイルし、将来的なValidation、Migration、コード生成、ドキュメント生成、Provider実行の共通入力として利用します。

## はじめに読むもの

フレームワークの挙動を実装する前に、次の順序でドキュメントを読んでください。

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — システム構造と不変条件
2. [`docs/DECISIONS.md`](docs/DECISIONS.md) — MVPで確定済みの契約
3. [`docs/PLAN.md`](docs/PLAN.md) — 現在の実装順序
4. 変更対象に対応するサブシステム仕様

このリポジトリで開発するAI Agentは、[`AGENTS.md`](AGENTS.md)にも必ず従ってください。このファイルはAgentが自動検出できるようリポジトリ直下に置いています。

## ドキュメント

| ドキュメント                                   | 目的                                    |
| ---------------------------------------------- | --------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | アーキテクチャ、依存ルール、不変条件    |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)       | MVPで確定済みの横断的な設計判断         |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | 機能要件・非機能要件                    |
| [`docs/CLI.md`](docs/CLI.md)                   | 公開CLI契約                             |
| [`docs/SCHEMA.md`](docs/SCHEMA.md)             | Schema DSL仕様                          |
| [`docs/MIGRATION.md`](docs/MIGRATION.md)       | Migration計画と安全性                   |
| [`docs/GENERATOR.md`](docs/GENERATOR.md)       | 生成物と所有権                          |
| [`docs/PROVIDER.md`](docs/PROVIDER.md)         | Provider Interfaceと分離規則            |
| [`docs/DEVELOPER.md`](docs/DEVELOPER.md)       | 内部モジュールと開発ルール              |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)           | Milestoneと開発順序                     |
| [`docs/PLAN.md`](docs/PLAN.md)                 | 現在の実装Phase                         |
| [`docs/MCP.md`](docs/MCP.md)                   | MCP Tool、Resource、Transport、安全方針 |
| [`docs/TODO.md`](docs/TODO.md)                 | 残作業と将来対応                        |

## 現在の実装状況

実装済みの基盤:

- npm／TypeScript monorepoと厳格なpackage境界
- Project Root検出
- 厳格な`gstack.yaml`読込とversion検証
- Schema source読込、YAML 1.2構文診断、構文専用の独自AST
- Provider非依存で正規化されたApplication Model契約
- Semantic AnalyzerとApplication Model生成
- Semantic Validation／Application Modelを含む構造化Core Read APIとmachine-readable envelope
- `schema validate --json`
- Application Model Resourceを含む読取専用local stdio MCP Tool／Resource
- Provider非依存のMigration Diff／Plan／File／Historyと注入可能なCore／MCP Read API
- Generated Artifact／Manifest／再生成Plan基盤とTypeScript Type Generator

Migration Apply／Rollback、Generator、Provider実装、Deployは今後のPhaseです。

## 開発時の検証

```bash
npm run check
```

format、lint、TypeScript、unit／integration test、Architecture test、built CLI contract testをまとめて実行します。
