# Requirements Specification

> Documentation index: [`../README.md`](../README.md)

> Version: 0.1.0 (Draft)

---

# 1. Purpose

本ドキュメントは gstack の要件を定義する。

本ドキュメントでは

* 機能要件
* 非機能要件
* 設計要件
* 制約事項

を整理する。

実装方法については定義しない。

---

# 2. Objectives

gstack の目的は以下である。

* CLIのみでアプリケーション開発を完結できること
* 宣言型開発を実現すること
* AIと人間の双方が扱いやすい構成を提供すること
* コード生成による開発効率を向上させること
* Providerを差し替え可能な設計を提供すること

---

# 3. Functional Requirements

## FR-001 プロジェクト生成

システムは新規プロジェクトを生成できること。

例

```bash
gstack init sample-app
```

---

## FR-002 Schema管理

システムはSchemaを管理できること。

機能

* 作成
* 更新
* 検証
* 差分表示
* 整形

---

## FR-003 Migration

SchemaからMigrationを生成できること。

Migrationは以下をサポートする。

* Plan
* Apply
* Rollback
* History
* Status

---

## FR-004 Code Generation

Schemaからコードを生成できること。

生成対象

* API
* Frontend
* TypeScript
* Validation
* OpenAPI
* Documentation

---

## FR-005 Provider

複数Providerへ対応できること。

初期実装

* Google Workspace

将来

* PostgreSQL
* SQLite
* Supabase
* Firebase

---

## FR-006 Authentication

認証情報を管理できること。

対象

* Login
* Logout
* Status

---

## FR-007 Deployment

CLIからデプロイできること。

---

## FR-008 Development Environment

ローカル開発環境を起動できること。

---

## FR-009 Validation

Schemaを検証できること。

対象

* YAML
* 型
* Relation
* 命名規則
* 重複

---

## FR-010 Documentation Generation

以下を自動生成できること。

* API仕様
* OpenAPI
* AGENTS.md
* 型定義
* AI Documentation

---

## FR-011 Programmatic Core API

CLI、MCP、将来のToolは、同じProvider非依存Core APIを利用できること。

Core APIはhuman-readableな表示文字列ではなく構造化されたResultを返し、Testから直接呼び出せること。

---

## FR-012 MCP Read Integration

Local AI Agentはstdio MCP Adapterを通じてProject状態、Schema、およびValidation結果を読み取れること。

初期MCPはRead / Validate操作を優先し、Migration Apply、Rollback、Deployなどの危険な操作を公開しないこと。

---

# 4. Non-Functional Requirements

## NFR-001 Maintainability

保守しやすい構造であること。

* モジュール分割
* 低結合
* 高凝集

---

## NFR-002 Extensibility

Providerを追加できること。

Coreを変更せずに新Providerを追加できることを目標とする。

---

## NFR-003 Reproducibility

生成物はいつでも再生成できること。

---

## NFR-004 Predictability

同じ入力から同じ結果を生成すること。

---

## NFR-005 Testability

各モジュールは単体テスト可能であること。

---

## NFR-006 Performance

必要最小限のAPI通信で処理を行うこと。

---

## NFR-007 Reliability

Migration途中で異常終了した場合でも復旧可能であること。

---

# 5. Design Requirements

## DR-001 CLI First

すべての操作はCLI経由で実施する。

---

## DR-002 AI First

AIが理解しやすい構造を維持する。

---

## DR-003 Declarative

Schemaを記述するだけでシステム全体を構築できること。

---

## DR-004 Single Source of Truth

Schemaを唯一の設計情報とする。

Schemaから

* Database
* Migration
* API
* Frontend
* Validation
* Documentation

を生成する。

---

## DR-005 Provider Isolation

CoreはProviderを知らない。

Google依存コードはGoogle Providerに閉じ込める。

---

## DR-006 Generated Code

自動生成コードと手動コードを明確に分離する。

例

```text
generated/

app/

custom/
```

---

## DR-007 Idempotency

同じコマンドは複数回実行しても安全であることを目標とする。

---

# 6. Constraints

初期バージョンでは以下を前提とする。

* YAMLをSchemaとして利用する
* CLIを唯一の操作方法とする
* Google Workspaceを標準Providerとする

---

# 7. Out of Scope

初期リリースでは対象外。

* GUI
* GraphQL
* マイクロサービス
* Kubernetes
* マルチクラウド
* 分散DB
* リアルタイム同期

---

# 8. Success Criteria

以下を満たした場合、MVP完成とする。

* プロジェクト生成ができる
* Schema作成ができる
* Migrationできる
* CRUD生成ができる
* React生成ができる
* Provider経由でデプロイできる
* AI Documentationを生成できる

---

# 9. Future Requirements

将来的に検討する機能

* Plugin System
* MCP Integration
* AI Agent Commands
* テストコード生成
* Seeder
* Monitor
* Cache
* ログビューア
* GUI管理画面

---

# 10. Traceability

各ドキュメントとの対応関係

| Document        | Purpose        |
| --------------- | -------------- |
| ARCHITECTURE.md | システム全体の思想・構成   |
| CLI.md          | CLIの公開仕様       |
| SCHEMA.md       | Schemaフォーマット仕様 |
| PROVIDER.md     | Provider仕様     |
| GENERATOR.md    | コード生成仕様        |
| DEVELOPER.md    | 内部実装仕様         |
| ROADMAP.md      | 開発計画           |

---

# 11. Requirement Management

要件は以下の原則に従って管理する。

* 要件と実装を分離する
* 要件は実装方法を規定しない
* 要件変更は後方互換性を考慮する
* 新機能追加時は本ドキュメントを更新する
* 要件ID（FR/NFR/DR）を維持し、変更履歴を追跡できるようにする
