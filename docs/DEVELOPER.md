# Developer Guide

> Documentation index: [`../README.md`](../README.md)

> Version: 0.1.0 (Draft)

---

# 1. Purpose

本ドキュメントはgstack開発者向けの内部設計仕様を定義する。

本ドキュメントでは

* モジュール構成
* クラス責務
* データフロー
* 依存関係
* 実装ルール
* コーディング方針

を定義する。

CLI利用者向け仕様ではない。

---

# 2. Design Principles

Coreは以下の原則を守る。

* 単一責任
* 依存性逆転
* Interface First
* Provider非依存
* Generator非依存
* テスト容易性
* 再利用性

---

# 3. Repository Structure

```text
gstack/

├── packages/
│
├── cli/
│
├── templates/
│
├── providers/
│
├── docs/
│
└── tests/
```

---

# 4. Package Structure

```text
packages/

├── core/
│
├── parser/
│
├── schema/
│
├── analyzer/
│
├── migration/
│
├── generator/
│
├── provider/
│
├── plugin/
│
├── config/
│
├── utils/
│
└── shared/
```

各Packageは単一責務を持つ。

---

# 5. Core Responsibilities

Coreは以下のみを担当する。

* Schema読込
* Parser実行
* Semantic Analysis
* Application Model生成
* Migration呼び出し
* Generator呼び出し
* Provider呼び出し
* Plugin管理

Coreは外部サービスを直接操作しない。

---

# 6. Internal Flow

```text
CLI

↓

Config Loader

↓

Schema Loader

↓

Parser

↓

AST

↓

Semantic Analyzer

↓

Application Model

↓

Engine

↓

Provider
```

CLI、MCP、将来のAdapterは同じCore Programmatic APIを利用する。Coreは構造化されたResultを返し、human-readable output、JSON、MCP protocol contentへの変換はAdapter側で行う。

```text
CLI ─┐
MCP ─┼─> Core API -> Use Case -> Structured Result
IDE ─┘
```

---

# 7. Parser

ParserはSchema DSLをASTへ変換する。

入力

```text
schema/*.yaml
```

出力

```text
AST
```

責務

* YAML解析
* Syntax Validation
* Token生成
* AST生成

Parserは意味解析を行わない。

---

# 8. AST

ASTはSchemaの構文木である。

例

```text
Application

└── Model(users)

    ├── Column(id)

    ├── Column(name)

    └── Relation(...)
```

ASTはYAML構造を保持する。

---

# 9. Semantic Analyzer

Semantic AnalyzerはASTを解析し、

Application Modelを生成する。

責務

* 型検証
* Relation検証
* Enum検証
* Duplicate検証
* 命名規則
* 依存関係解析

---

# 10. Application Model

Application ModelはCore内部の共通データ構造である。

Migration

Generator

Validation

Provider Validation

Documentation

すべてApplication Modelを利用する。

```text
Application

├── Models

├── APIs

├── UI

├── Permissions

├── Workflows

└── Metadata
```

---

# 11. Migration Engine

Migration Engineは

Application Model同士を比較する。

```text
Previous Model

↓

Current Model

↓

Diff

↓

Operations
```

Migration EngineはSQLを生成しない。

---

# 12. Generator Engine

Generator Engineは

Application Modelから成果物を生成する。

```text
Application Model

↓

Generator

↓

Artifacts
```

GeneratorはDatabase状態を参照しない。

---

# 13. Provider Registry

Provider Registryは

利用可能Providerを管理する。

責務

* Discovery
* Load
* Compatibility Check
* Registration

---

# 14. Plugin Manager

Plugin Managerは

Pluginのロードを担当する。

対象

* Provider Plugin
* Generator Plugin
* Future Plugin

---

# 15. Configuration

設定は以下に分離する。

```text
Schema

↓

Application Definition
```

```text
gstack.yaml

↓

Project Configuration
```

```text
.gstack/

↓

Internal State
```

```text
Environment Variables

↓

Secrets
```

---

# 16. Dependency Rules

許可

```text
CLI

↓

Core

↓

Parser

↓

Analyzer

↓

Application Model

↓

Engine

↓

Provider Interface

↓

Provider
```

禁止

```text
Parser → Provider

Generator → Provider

Migration → Provider API

Provider → Parser

Provider → CLI
```

---

# 17. Module Communication

Module同士はInterface経由で通信する。

例

```text
Migration Engine

↓

Migration Interface

↓

Provider
```

実装へ直接依存しない。

---

# 18. Error Handling

内部Error

* ParserError
* SchemaError
* SemanticError
* MigrationError
* GeneratorError
* ProviderError
* ConfigurationError

CLIへ返す際は統一フォーマットへ変換する。

Core境界では想定内Errorをstable code、category、safe message、任意のpath/hintを持つ構造へ変換する。CLIとMCPは同じError detailsをpresentation/protocol形式へ変換し、内部cause、Credential、stack trace、外部library固有messageを通常出力へ公開しない。

Project root自動検出はConfig packageが担当し、現在Directoryから親方向へ最も近い`gstack.yaml`を探す。Config内容の解析・Validationとは混在させない。

---

# 19. Logging

ログレベル

```text
TRACE

DEBUG

INFO

WARN

ERROR

FATAL
```

Provider固有ログはProvider内で管理する。

---

# 20. Testing Strategy

テスト階層

```text
Unit Test

↓

Integration Test

↓

Provider Test

↓

CLI Test
```

各Packageは単体テスト可能であること。

---

# 21. Interfaces

CoreはInterfaceのみを利用する。

例

```text
Parser Interface

Generator Interface

Migration Interface

Provider Interface
```

Interfaceを変更する場合は後方互換性を考慮する。

---

# 22. File Ownership

```text
generated/
```

Generator所有

```text
custom/
```

開発者所有

```text
schema/
```

利用者所有

```text
.gstack/
```

Core所有

---

# 23. Coding Standards

* TypeScript Strict Mode
* ESLint
* Prettier
* 明確な命名
* 副作用を最小化
* Pure Functionを優先

---

# 24. Performance

Coreでは以下を意識する。

* Lazy Loading
* Incremental Parsing
* Incremental Generation
* 差分比較
* キャッシュ利用

---

# 25. Security

禁止事項

* Secretをログへ出力
* CredentialをSchemaへ保存
* TokenをGenerated Codeへ埋め込む

Environment VariablesまたはProvider管理を利用する。

---

# 26. Future Improvements

将来的に追加予定

* Incremental Compiler
* Watch Mode
* Parallel Generator
* Cache Engine
* Language Server
* MCP Server

---

# 27. Development Workflow

```text
Implement

↓

Unit Test

↓

Integration Test

↓

Provider Test

↓

CLI Test

↓

Documentation Update
```

ドキュメント更新を実装フローに含める。

---

# 28. Architecture Invariants

開発者は以下を守ること。

1. CoreはProviderを知らない
2. ProviderはSchemaを解析しない
3. MigrationはProvider APIを直接呼ばない
4. GeneratorはRuntimeへ依存しない
5. Parserは意味解析をしない
6. ASTは構文のみ保持する
7. Semantic Analyzerのみ意味解析を行う
8. Application Modelのみを各Engineへ渡す
9. PluginはInterfaceのみ実装する
10. Generated Codeは手動編集しない
11. CLIとMCPはCoreのBusiness Logicを再実装しない
12. Core APIはpresentation済み文字列ではなく構造化されたResultを返す

---

## Plugin packageの公開前確認

Plugin packageはbuild後、publish前に次を実行する。

```bash
gstack plugin package validate --directory <plugin-package>
```

この検証はManifestとpackage identity、root export、型宣言、実際のnpm pack収録物を確認する。検証成功はpublishを実行せず、registry上のpackage安全性や第三者コードの信頼性を保証するものではない。

---

# 29. Relationship with Other Documents

## Accepted MVP Contract

`DECISIONS.md` is normative for AST/IR, Validation ownership, Application Model boundaries, package publication, Provider abstraction, and machine-readable results. MVP uses one syntax-only AST and no separate Validation Engine. Public Adapters consume Core structured data; internal packages remain non-public implementation details unless a later decision changes their status.

## CI Gate

GitHub ActionsはPull Requestと`main`へのpushでNode.js 24、lockfileに基づく`npm ci`、`npm run check`を実行する。CIの標準gateはformat、lint、strict TypeScript、全test、Architecture依存検査、build済みCLI contractを含む。Google credentialやaccess tokenをCI workflowへ保存せず、外部Google APIを必要とするlive testはこのgateへ暗黙追加しない。

| Document        | Purpose     |
| --------------- | ----------- |
| ARCHITECTURE.md | 全体アーキテクチャ   |
| REQUIREMENTS.md | システム要件      |
| CLI.md          | CLI公開仕様     |
| SCHEMA.md       | DSL仕様       |
| MIGRATION.md    | Migration仕様 |
| PROVIDER.md     | Provider仕様  |
| GENERATOR.md    | Generator仕様 |
| ROADMAP.md      | 実装ロードマップ    |

---

# 30. Summary

gstack内部は以下の責務分離を基本とする。

```text
Schema
    │
    ▼
Parser
    │
    ▼
AST
    │
    ▼
Semantic Analyzer
    │
    ▼
Application Model
    │
    ├── Migration
    ├── Generator
    ├── Validation
    ├── Documentation
    └── Provider Validation
            │
            ▼
     Provider Interface
            │
            ▼
     External Services
```

すべての内部コンポーネントは、この依存方向を維持しながら実装する。
