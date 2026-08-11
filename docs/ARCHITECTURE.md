# gstack Architecture

> Documentation index: [`../README.md`](../README.md)

> Version: 0.2.0 (Draft)

---

# 1. Vision

gstackは、**CLI First・AI First・Schema First**なフルスタックアプリケーションフレームワークである。

開発者は宣言型Schemaを記述し、CLIを操作することで、

* Database
* Migration
* Backend API
* Frontend
* Validation
* Documentation
* Deployment

までを一貫して構築できる。

Google Workspaceを最初の実行基盤として採用するが、gstack Core自体はGoogle Workspaceへ依存しない。

Google Sheets、Apps Script、Google Drive、Google OAuthなどは、Provider Pluginとして実装する。

gstackが目指すのは、

**「Schemaにアプリケーションを宣言し、CLIだけで実装・変更・デプロイできる開発環境」**

である。

---

# 2. Core Concept

gstackの中心に存在するものはコードではなくSchemaである。

```text
Schema
    ↓
Parser
    ↓
Intermediate Representation
    ↓
Semantic Analysis
    ↓
Application Model
```

Application Modelを共通入力として、

```text
Application Model
    │
    ├── Migration
    ├── Generator
    ├── Validation
    ├── Documentation
    ├── AI Context
    └── Provider Validation
```

を実行する。

そのためgstackは単なるコードジェネレータではなく、

**アプリケーションDSLを処理するCompiler / Build System**

として設計する。

---

# 3. Goals

gstackは以下を実現することを目標とする。

* CLIのみで主要な開発作業を完結できる
* SchemaをSingle Source of Truthとする
* 宣言型DSLからアプリケーションを構築する
* AI Agentが安全に操作できる
* Providerを自由に差し替えられる
* Google固有処理をCoreから分離する
* 生成物を再生成可能にする
* MigrationをProvider非依存にする
* コードとインフラを同じSchemaから構築する
* 外部サービスの管理画面操作を最小化する

---

# 4. Non-Goals

gstackは以下を目的としない。

* Google APIの単純なWrapper
* Google Sheets専用ORM
* Apps Script専用Framework
* React専用Framework
* SQL Migration Tool
* GUIによるLow-Code Platform

これらの機能を内部で利用することはあるが、gstack全体の目的ではない。

---

# 5. Design Principles

## 5.1 Schema First

アプリケーション仕様はSchemaへ宣言する。

Schemaを基準として、

* Database
* API
* UI
* Validation
* Permission
* Documentation

を構築する。

---

## 5.2 CLI First

gstackの主要操作はCLIから実行可能とする。

例

```bash
gstack init my-app

gstack schema init users

gstack schema validate

gstack migration plan

gstack migration apply

gstack generate

gstack dev

gstack deploy
```

外部サービスのWeb Console操作は可能な限り要求しない。

---

## 5.3 AI First

gstackは人間だけではなく、AI Agentから操作されることを前提とする。

そのため、

* PredictableなCLI
* Machine-readable output
* 明確なSchema
* OpenAPI
* AGENTS.md
* Project Context
* Migration Plan
* Destructive Operation Protection

などを提供する。

AIが推測によって危険な操作を実行する設計を避ける。

---

## 5.4 Declarative

利用者は「どう実装するか」ではなく、

**「どのようなアプリケーションが必要か」**

をSchemaへ記述する。

---

## 5.5 Single Source of Truth

Schemaをアプリケーション設計の基準とする。

ただし、SchemaとMigrationは責務を分離する。

```text
Schema
=
Desired State


Migration
=
State Transition
```

---

## 5.6 Provider Independence

Coreは具体的な外部サービスを認識しない。

Google Workspace、PostgreSQL、SQLite、Cloud RunなどはProvider Pluginとして実装する。

---

## 5.7 Reproducibility

Schema・Config・Migrationから可能な限り同じ環境を再構築できることを目指す。

---

# 6. System Architecture

```text
                         Developer / AI Agent
                                  │
                                  ▼
                         CLI / MCP / Future Tool
                                  │
                                  ▼
                         ┌─────────────────┐
                         │      Core       │
                         └────────┬────────┘
                                  │
                                  ▼
                              Schema DSL
                                  │
                                  ▼
                               Parser
                                  │
                                  ▼
                    Intermediate Representation
                            (IR / AST)
                                  │
                                  ▼
                         Semantic Analyzer
                                  │
                                  ▼
                        Application Model
                                  │
             ┌────────────────────┼────────────────────┐
             │                    │                    │
             ▼                    ▼                    ▼
       Migration Engine     Generator Engine     Validation
             │                    │
             ▼                    ▼
     Abstract Operations    Generated Artifacts
             │
             ▼
      Provider Registry
             │
             ▼
      Provider Interface
             │
     ┌───────┼────────┬────────┬─────────┐
     ▼       ▼        ▼        ▼         ▼
 Database   API      Auth    Storage    Deploy
 Provider Provider Provider Provider  Provider
     │
     ▼
 External Services
```

---

# 7. Compiler Architecture

gstackはSchemaを直接各Generatorへ渡さない。

必ず共通の中間表現を経由する。

```text
YAML Schema
     │
     ▼
   Parser
     │
     ▼
Raw AST / IR
     │
     ▼
Semantic Analyzer
     │
     ▼
Normalized Application Model
```

このApplication Modelをgstack内部の共通データ構造とする。

---

# 8. Why Intermediate Representation

SchemaのYAML構造と内部実装を直接結合すると、

* Generator
* Migration
* Provider
* AI
* Validation

がすべてYAML仕様へ依存してしまう。

そのため中間表現を導入する。

```text
Schema Syntax
     ↓

Parser

     ↓

Application Model

     ↓

各Engine
```

これにより将来的にSchema記述形式を変更・追加しても、Application Model以降への影響を小さくできる。

例えば将来的に、

```text
YAML
JSON
TypeScript DSL
AI Generated Schema
```

などを入力として利用できる可能性を残す。

---

# 9. Application Model

Application Modelはアプリケーション全体を表現する内部構造である。

概念的には以下を持つ。

```text
Application

├── Models
│   ├── Fields
│   ├── Relations
│   ├── Validation
│   └── Metadata
│
├── Database
│
├── APIs
│
├── UI
│
├── Permissions
│
├── Workflows
│
└── Events
```

Migration、Generator、Provider Validationなどは、このApplication Modelを利用する。

---

# 10. Schema Architecture

SchemaはDatabase Schemaではない。

**アプリケーション全体を表現するDSL**である。

基本構造

```yaml
name: users

model:
  displayName: User

database:
  primaryKey: id

  columns:
    id:
      type: uuid

    name:
      type: string

api:
  resource: users

ui:
  list:
    columns:
      - name

validation:
  name:
    minLength: 1

permissions:
  read:
    - user
```

詳細は `SCHEMA.md` で定義する。

---

# 11. Core Architecture

Coreは以下の責務を持つ。

```text
Core

├── Schema Parser
├── Intermediate Representation
├── Semantic Analyzer
├── Application Model
├── Validation
├── Migration Planner
├── Generator Orchestrator
├── Provider Registry
├── Plugin Manager
└── Configuration
```

Coreは以下を直接実行してはならない。

* Google API
* SQL
* Apps Script API
* Google Sheets API
* PostgreSQL Driver
* Cloud API

---

# 12. Migration Architecture

MigrationはApplication Modelの変更を実環境へ反映する。

```text
Previous Application Model

            VS

Current Application Model

            ↓

        Diff Engine

            ↓

     Migration Planner

            ↓

    Abstract Operations

            ↓

         Provider
```

Abstract Operation例

```text
create_model
drop_model

add_column
drop_column
rename_column
alter_column

add_index
drop_index
```

Migration EngineはSQLやGoogle Sheets操作を生成しない。

---

# 13. Generator Architecture

GeneratorはApplication ModelからArtifactsを生成する。

```text
Application Model
        │
        ├── Type Generator
        ├── API Generator
        ├── UI Generator
        ├── Validation Generator
        ├── OpenAPI Generator
        ├── Documentation Generator
        └── AI Context Generator
```

生成例

```text
generated/

├── api/
├── frontend/
├── types/
├── validation/
├── openapi/
├── docs/
└── ai/
```

GeneratorはProviderの状態を参照しない。

---

# 14. Provider Architecture

Providerは外部サービスを利用するPluginである。

```text
Core

↓

Provider Registry

↓

Provider Interface

↓

Provider Plugin

↓

External Service
```

Provider例

```text
@gstack/provider-google

@gstack/provider-postgres

@gstack/provider-sqlite

@gstack/provider-cloudrun
```

CoreはProviderの具体的実装を認識しない。

---

# 15. Provider Capabilities

ProviderはCapability単位で機能を提供する。

```text
Database
API
Authentication
Storage
Deploy
```

1Providerが複数Capabilityを持ってもよい。

---

# 16. Mixed Provider Architecture

Providerは用途ごとに変更できる。

例

```text
Database
→ PostgreSQL

API
→ Cloud Run

Authentication
→ Google

Storage
→ Google Drive

Deploy
→ Cloud Run
```

Coreは各Capabilityに対応したProvider Interfaceのみを利用する。

---

# 17. Google Provider

MVPではGoogle Providerを公式Providerとして実装する。

```text
@gstack/provider-google
```

Google Providerは以下を提供する。

```text
Database
→ Google Sheets

API
→ Apps Script

Authentication
→ Google OAuth

Storage
→ Google Drive

Deploy
→ Apps Script / Google Workspace
```

Google固有処理はGoogle Provider内部に限定する。

---

# 18. Plugin Architecture

ProviderおよびGenerator ExtensionはPluginとして追加可能な設計とする。

```text
gstack Core

↓

Plugin Registry

├── Provider Plugin
├── Generator Plugin
└── Future Plugin
```

将来的にはサードパーティPluginも利用できるようにする。

---

# 19. Repository Structure

初期構成例

```text
gstack/

├── cli/
│
├── packages/
│
│   ├── core/
│   │
│   ├── schema/
│   │
│   ├── migration/
│   │
│   ├── generator/
│   │
│   ├── plugin/
│   │
│   ├── provider/
│   │
│   ├── auth/
│   │
│   └── deploy/
│
├── providers/
│   │
│   └── google/
│
├── templates/
│
├── examples/
│
├── docs/
│
└── tests/
```

将来的にはProviderを独立Packageとして分離できる。

---

# 20. Project Structure

gstackによって生成されるProject例

```text
my-app/

├── app/
│
├── schema/
│   ├── users.yaml
│   └── products.yaml
│
├── migrations/
│
├── generated/
│
├── custom/
│
├── docs/
│
├── templates/
│
├── .gstack/
│
├── gstack.yaml
│
└── package.json
```

---

# 21. Generated vs Manual Code

自動生成領域と手動編集領域は明確に分離する。

```text
generated/
```

はGeneratorが所有する。

開発者は原則編集しない。

```text
app/
custom/
```

は開発者が所有する。

Generatorは原則変更しない。

---

# 22. Configuration Architecture

設定は責務によって分離する。

```text
Schema
→ Application Definition

gstack.yaml
→ Project Configuration

.gstack/
→ Internal State

Environment Variables
→ Secret / Environment Information

Provider Config
→ Provider-specific Configuration
```

SchemaへProvider固有設定やCredentialを書いてはならない。

---

# 23. Secret Management

SecretはSchema、Migration、Generated Codeへ保存しない。

対象

* OAuth Secret
* API Key
* Refresh Token
* Password
* Credential

SecretはEnvironment VariablesまたはProviderが提供するSecret Storageを利用する。

---

# 24. Development Flow

基本フロー

```text
gstack init

↓

Schema作成

↓

gstack schema validate

↓

Parser

↓

Application Model生成

↓

gstack migration plan

↓

Migration確認

↓

gstack migration apply

↓

gstack generate

↓

gstack dev

↓

gstack deploy
```

---

# 25. Command Relationship

```text
                       gstack init
                            │
                            ▼
                         schema
                            │
                            ▼
                         validate
                            │
                            ▼
                    Application Model
                      ┌─────┴─────┐
                      │           │
                      ▼           ▼
                 migration     generate
                      │           │
                      ▼           ▼
                  Provider      Source
                      │
                      ▼
                   deploy
```

---

# 26. Dependency Rules

許可

```text
CLI
 ↓
Core
 ↓
Application Model
 ↓
Engine
 ↓
Provider Interface
 ↓
Provider Plugin
```

禁止

```text
CLI → Google API

Core → Google API

Core → PostgreSQL

Generator → Provider

Schema → Provider

Migration → Google Sheets API

Provider → CLI
```

---

# 27. Error Architecture

外部サービスのErrorはProvider内部で共通Errorへ変換する。

例

```text
SchemaError
ValidationError
MigrationError
GeneratorError
ProviderError
AuthenticationError
DeploymentError
```

CLIは内部ライブラリ固有例外をそのまま表示しない。

---

# 28. Safety Architecture

gstackはコード生成だけでなく、実環境変更を行う。

そのため安全性を設計要件とする。

特にMigrationでは、

* Plan before Apply
* Dry Run
* Risk Classification
* Destructive Operation Protection
* Migration Lock
* Checksum
* History

を提供する。

AI Agentも同じ安全機構を経由する。

---

# 29. AI Architecture

AI Agentはgstack Coreを直接操作するのではなく、原則としてCLIまたは将来的なMCP Interfaceを利用する。

```text
AI Agent

↓

CLI / MCP

↓

gstack Core
```

これにより人間とAIが同じ操作体系を利用する。

将来的なMCP Tool例

```text
get_schema

validate_schema

get_migration_plan

get_project_context

generate_code

get_provider_capabilities
```

破壊的変更を実行するMCP Toolには追加の安全制御を設ける。

初期MCP Integrationはlocal stdio transportとRead / Validate操作だけを提供する。MCP AdapterはCore Programmatic APIを呼び出す薄い境界であり、Parser、Analyzer、Migration、Generator、Providerの処理を再実装しない。詳細は`MCP.md`を参照する。

```text
              gstack Core API
             /       |       \
           CLI      MCP    Future Tools
```

Core APIは表示済み文字列ではなく構造化されたResultを返す。Human output、JSON output、MCP contentへの変換は各Adapterが担当する。

---

# 30. External Service Abstraction

gstackは外部サービスを直接アプリケーション概念として扱わない。

例

```text
Database
     ↓
Database Provider
     ↓
Google Sheets
```

```text
API
     ↓
API Provider
     ↓
Apps Script
```

これによりGoogle Workspace以外へ移行してもSchemaへの影響を最小限にする。

---

# 31. MVP Architecture

最初のMVPでは以下を実装する。

## Core

* CLI
* YAML Schema Parser
* Application Model
* Schema Validation
* Diff Engine
* Migration Planner
* Generator Engine
* Provider Registry

## Provider

* Google Provider

## Google Database

* Google Sheets

## Google API

* Apps Script

## Authentication

* Google OAuth

## Frontend

* React

## Generation

* TypeScript
* CRUD
* Validation
* OpenAPI
* Basic React UI
* AI Documentation

## Migration

* Create Model
* Drop Model
* Add Column
* Drop Column
* Rename Column
* Alter Column

---

# 32. Future Architecture

将来的には以下へ拡張可能な設計とする。

## Database Providers

* SQLite
* PostgreSQL
* MySQL
* Supabase

## API / Compute Providers

* Cloud Run
* AWS Lambda
* Azure Functions

## Storage Providers

* Google Drive
* S3
* Azure Blob

## Authentication Providers

* Google OAuth
* Auth0
* Microsoft Entra ID

## Generators

* React
* Vue
* Flutter
* SDK
* Terraform
* Test
* Storybook

---

# 33. Architecture Decision Principles

新機能を追加する際は、以下の順序で設計を検討する。

### 1. Schemaでどう表現するか

機能を宣言型DSLとして表現できるか検討する。

### 2. Application Modelでどう表現するか

YAML固有表現ではなく内部モデルとして定義する。

### 3. Coreの責務か判断する

特定Providerへ依存しない機能のみCoreへ追加する。

### 4. Provider Capabilityか判断する

外部サービス固有処理はProviderへ実装する。

### 5. Generatorか判断する

Source CodeやDocumentationの生成であればGeneratorへ実装する。

### 6. CLIを追加する必要があるか判断する

Schemaで表現できる機能のためだけに不要なCLI Commandを増やさない。

---

# 34. Architecture Invariants

以下はgstackの基本原則として維持する。

1. SchemaはProviderを知らない
2. CoreはGoogleを知らない
3. Migration EngineはSQLを知らない
4. Generatorは実Databaseを知らない
5. ProviderはSchema Parserを実装しない
6. CLIは外部APIを直接呼ばない
7. Generated CodeとManual Codeを分離する
8. SecretをSchemaへ保存しない
9. Destructive Migrationを暗黙実行しない
10. AIと人間は可能な限り同じInterfaceを利用する
11. CLI・MCP・将来のToolは同じCore APIを利用し、Business Logicを再実装しない

---

# 35. Document Responsibilities

| Document        | Responsibility    |
| --------------- | ----------------- |
| ARCHITECTURE.md | gstack全体の構造・設計思想  |
| REQUIREMENTS.md | 機能・非機能要件          |
| CLI.md          | CLI公開Contract     |
| SCHEMA.md       | DSL / Schema仕様    |
| MIGRATION.md    | Migration仕様       |
| PROVIDER.md     | Provider Plugin仕様 |
| GENERATOR.md    | Artifact生成仕様      |
| DEVELOPER.md    | 内部クラス・Module・実装仕様 |
| ROADMAP.md      | 実装順序・将来計画         |
| MCP.md          | MCP Adapter・Tool・Resource・安全方針 |
| DECISIONS.md    | 承認済みMVP Contract・横断的設計判断 |

---

# 36. Architecture Summary

gstackの全体構造を最も単純化すると以下となる。

```text
            Schema DSL
                │
                ▼
              Parser
                │
                ▼
        Application Model
                │
       ┌────────┼────────┐
       │        │        │
       ▼        ▼        ▼
 Migration  Generator Validation
       │
       ▼
 Abstract Operations
       │
       ▼
 Provider Interface
       │
       ▼
 External Services
```

gstackは、

**Schemaをコンパイルし、Application Modelを介してコードと実行環境の双方を構築するアプリケーションフレームワーク**

として設計する。
