# Roadmap

> Documentation index: [`../README.md`](../README.md)

> Version: 0.1.0 (Draft)

---

# 1. Purpose

本ドキュメントはgstackの開発ロードマップを定義する。

目的は以下のとおり。

- 開発の優先順位を明確にする
- MVPの範囲を定義する
- 将来の拡張計画を整理する
- 機能追加時の判断基準を示す

---

# 2. Development Philosophy

gstackは以下の順序で実装する。

1. Core
2. Schema
3. Migration
4. Generator
5. Provider
6. CLI
7. AI Support
8. Plugin Ecosystem

機能を増やす前に、Coreの完成度を優先する。

---

# 3. Milestones

| Version | Goal             |
| ------- | ---------------- |
| 0.1     | Core Foundation  |
| 0.2     | Migration Engine |
| 0.3     | Generator Engine |
| 0.4     | Google Provider  |
| 0.5     | First Deploy     |
| 0.6     | Plugin System    |
| 0.7     | AI Support       |
| 1.0     | Stable Release   |

Stable Release向けに、D-014の公開候補、同期version、metadata、公開依存closure、Build entry、CLI／MCP bin、`npm pack`収録物、機密file候補を監査する`release:audit`／`release:check`を追加済み。D-095では、利用者向け公開候補と、それを実行可能にする内部依存Packageを同期versionで配布する方針を採用し、MVPではbundleを導入しない。全14 Workspace Packageへ配布metadataと`dist`限定の収録範囲を設定し、Release Gateを通常CIへ組み込んだ。License確定前は`UNLICENSED`を維持し、実際の公開は行わない。

D-096では、利用者向け公開候補のpackage entry／root declarationと全CLI help treeを1.0互換性baselineとして固定した。通常CIは差分を拒否し、意図したAPI／CLI変更はSemVer影響をレビューしてbaselineを明示更新する。

D-098では、全14 Workspace Packageを実tarballへpackし、隔離Consumer Projectへlifecycle scriptなしでinstallして、全package entry importとCLI binを検証するRelease smoke testをGitHub Actionsへ追加した。Workspace linkやrepository rootの依存で配布不備を隠さない。

D-099では、root package versionをSingle Source of Truthとし、全Workspace Package、内部exact dependency、lockfile、Core Runtime、CLI、MCP、公式Google Providerのversion同期を通常CIで検証する。正規SemVerを一括反映する`version:set`も追加した。

D-100では、全配布PackageへESM専用／Node.js 24以上のRuntime要件を個別に設定し、単独tarballでもConsumerへ要件が伝わることをRelease Gateで検証する。

D-101では、全14 PackageのtarballへREADMEを収録し、repository／homepage／bugs metadataを統一した。公開候補は用途と安全境界、内部依存Packageは直接利用がsupport外であることをnpm上でも明示する。

D-102では、技術的なpack readinessと実publish readinessを分離し、placeholder version／未決定Licenseをstable blockerとして明示する。全Workspace dependency graphの循環検査と決定的なtopological公開順序もRelease監査へ追加した。License、最初のversion、npm organization／provenanceはRepository ownerの判断待ちであり、npm公開は行わない。

D-103では、公開準備判定と公開順序計算を副作用から分離し、通常CIでplaceholder、技術診断、決定的順序、循環依存を回帰検証する。

---

# 4. Version 0.1 - Core Foundation

目的

Application Modelまで完成させる。

## Tasks

- CLI
- Config Loader
- Schema Loader
- YAML Parser
- AST
- Semantic Analyzer
- Application Model
- Error System
- Logging
- Programmatic Core Read API
- Structured Result
- Read-only local MCP Adapter

## Deliverables

- Schemaを読み込める
- Application Modelを生成できる
- Validationが動作する
- CLI以外からCore Read APIを呼び出せる
- AI Agentがstdio MCP経由でProject・Schema・Validationを読み取れる

Status: Config／Schema Loader、YAML Parser、AST、Semantic Analyzer、Application Model、Error／Structured Result、CLI、Programmatic Core Read API、read-only MCP、D-060のsecret-safeな構造化Logging contractを実装済み。Core FoundationのMVP Taskは完了。

---

# 5. Version 0.2 - Migration Engine

目的

Schema変更をProvider非依存Operationへ変換する。

## Tasks

- Diff Engine
- Migration Planner
- Migration File
- Migration History
- Checksum
- Rollback
- Risk Detection

## Deliverables

```text
Schema

↓

Migration Plan

↓

Migration File
```

Status: Provider非依存のDiff／Plan、Migration File／checksum、History／snapshot、risk、capability、Apply Engine、完了Operationを逆順変換するRollback Planを実装済み。D-090に従い、latest appliedだけを対象とするRollback dry-run／fingerprint承認、専用History進捗、破壊承認、失敗後の明示resumeをCore／Google Runtime／CLIへ実装した。D-091の中断History回復、deterministic lock診断、fingerprint承認付き明示unlockも実装済み。

---

# 6. Version 0.3 - Generator Engine

目的

Application Modelからコード生成を行う。

Status: MVP実装完了。Type、Validation、framework非依存API contract、React UI、OpenAPI、Model／AI Documentation、Manifest／Writer、Core／CLI／MCP integrationを含む。

## Tasks

- Type Generator
- Validation Generator
- API Generator
- UI Generator
- OpenAPI Generator
- Documentation Generator
- AI Documentation Generator

## Deliverables

```text
generated/

api/

frontend/

types/

validation/

docs/

openapi/

ai/
```

---

# 7. Version 0.4 - Google Provider

目的

Google Workspaceを実行基盤として利用可能にする。

Status: Provider package、Manifest、strict configuration、offline validation、OAuth／HTTP safety、Google Sheets／Drive／Apps Script adapter、統合health、Project Config、標準RuntimeからCLI／MCPへの接続まで実装済み。Google Sheets Migrationは`create_model`、`add_column`、同じ列位置でデータを保持する`rename_column`、明示destructive承認を必須とする不可逆な`drop_column`／`drop_model`をatomic batch、管理marker、競合拒否、再開可能なExecutorとして実装しManifestで`native`を宣言する。`alter_column`、Index、Relationは既存値を変更せず互換性を検査し、生成Apps Scriptが将来writeを保証する`emulated` Operationとして実装済み。全MVP Migration Operationを標準Runtimeへ接続した。CLI Applyはdry-run、fingerprint承認、破壊操作承認、failed Migration再開まで実装済み。Apps Scriptは管理project初期化、source bundle、content全置換、version／deployment、Migration readiness gate、Deploy CLIまで実装済み。D-089のstrict role binding、`USER_ACCESSING` active identity、全CRUD fail-closed permission検証も実装済みで、Web App accessは`MYSELF`を維持する。

## Tasks

Database

- Google Sheets

API

- Apps Script

Storage

- Google Drive

Authentication

- Google OAuth

Deploy

- Apps Script

---

# 8. Version 0.5 - First Deploy

目的

CLIだけでアプリケーションを公開できるようにする。

## Tasks

- Build
- Deploy
- Publish
- Project Initialization
- Local Development

Status: BuildはApplication Modelからprivate Apps Script Web App sourceを決定的に生成し、`gstack build --dry-run`／`gstack build`でgenerated writeとGoogle bundle検証を分離する。Deployは無副作用`--dry-run`、target／bundle fingerprint、明示`--approval`、管理project限定content更新、冪等version／deployment公開、Migration最新確認gateまで実装済み。Project Initializationは空Apps Script project限定のpreview／approval付きCLIを実装済み。Field runtime validationとD-089のpermission role mappingは実装済み。Local Developmentはloopback限定in-memory APIを実装済み。Publish accessは安全側の`MYSELF`を維持し、公開範囲拡張、UI bundling／hot reloadは将来対応とする。

---

# 9. Version 0.6 - Plugin System

目的

Coreを変更せずに拡張できる構造を完成させる。

## Tasks

- Provider Plugin
- Generator Plugin
- Plugin Registry
- Plugin Loader
- Plugin Manifest

Status: 完了。共通Plugin Manifest、SemVer互換性、memory Registry、明示npm specifier限定Loader、Project Config永続形式、Provider／Generator Pluginの標準Runtime接続、単一Generation Plan／Manifest統合、Plugin一覧、approval付きinstall／remove、publish前package検証を実装済み。

---

# 10. Version 0.7 - AI Support

目的

AI Agentが安全にgstackを操作できる環境を整備する。

## Tasks

- AGENTS.md Generator
- Project Context Generator
- AI Friendly Logs
- JSON Output
- MCP Support拡張（Application Model、Migration、Provider Context）
- AI Safety Rules

Status: 完了。生成領域向けAGENTS.md／PROJECT_CONTEXT.md、secret-safeな構造化Logging、CLI JSON envelope、Application Model／Migration／Provider／Generated Artifactを含むread-only MCP Tool／Resource、危険操作を登録しないAI Safety allowlist、Codex／Claude Code／汎用stdio hostのlocal installation guideを実装済み。

---

# 11. Version 1.0 - Stable Release

目標

Google Workspace上で実用的なアプリケーションを開発できる状態。

提供機能

- Schema DSL
- Migration
- CRUD
- React UI
- OpenAPI
- Google Provider
- Deploy
- Documentation

Status: Stable Releaseの実装・監査項目は完了。Node.js 24、`npm ci`、repository全checkを実行する最小権限GitHub Actions CI、D-092の`gstack init`、D-093の`schema init`、D-094のProvider非依存`migration create`を実装した。同じ生成Projectをbuilt CLIでinit、Schema作成、semantic validation、初回Migration File作成、Generation、非secret Google設定でBuild／Deploy dry-runまでend-to-end contract testした。D-095の全Workspace Package metadata／pack／依存closure Gateと、D-096の公開API／CLI互換性baselineも通常CIで検証する。Licenseは未決定のため`UNLICENSED`を維持し、実registry publishは行わない。

---

# 12. Future Providers

Database

- SQLite
- PostgreSQL
- MySQL
- Supabase

API

- Cloud Run
- AWS Lambda
- Azure Functions

Authentication

- Auth0
- Microsoft Entra ID

Storage

- Amazon S3
- Azure Blob Storage

---

# 13. Future Generators

- Vue
- Angular
- Flutter
- GraphQL
- SDK
- Terraform
- Storybook
- Test Generator
- ER Diagram Generator

---

# 14. Long-term Vision

将来的には以下を実現する。

- 複数Providerの組み合わせ
- サードパーティPlugin
- Provider Marketplace
- Generator Marketplace
- MCP Server
- Language Server
- VS Code Extension
- Visual Designer
- CI/CD Integration

---

# 15. Development Priority

実装優先順位は以下とする。

| Priority | Component       |
| -------- | --------------- |
| P0       | Core            |
| P1       | Schema          |
| P2       | Migration       |
| P3       | Generator       |
| P4       | Google Provider |
| P5       | Deploy          |
| P6       | Plugin          |
| P7       | AI              |

Coreより上位の優先順位は存在しない。

---

# 16. Success Criteria

MVP完成条件

- CLIだけでプロジェクト作成できる
- Schemaを記述できる
- Validationできる
- Migrationできる
- CRUD生成できる
- React画面生成できる
- Google Workspaceへデプロイできる

---

# 17. Architecture Rules

新機能追加時は以下を確認する。

- Schemaで表現できるか
- Application Modelへ追加すべきか
- Coreへ追加すべきか
- Generatorで対応すべきか
- Providerで対応すべきか
- Pluginとして実装すべきか

Coreを肥大化させないことを最優先とする。

---

# 18. Development Order

実装順序

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

Migration Engine

↓

Generator Engine

↓

Provider Registry

↓

Google Provider

↓

Deploy

↓

Plugin System

↓

AI Support
```

各フェーズは前フェーズの完成を前提とする。

---

# 19. Release Policy

- Major Version：破壊的変更
- Minor Version：新機能追加
- Patch Version：バグ修正

MVP期間中は互換性よりも設計品質を優先する。

Version 1.0以降は公開APIおよびCLIの後方互換性を維持する。

---

# 20. Future Considerations

現在は対象外だが、将来的に検討する。

- リアルタイム同期
- オフライン開発
- GUI Builder
- AIによるSchema生成
- AIによるMigration提案
- Visual Workflow Editor
- Marketplace
- Remote Plugin Registry

---

# 21. Relationship with Other Documents

| Document        | Purpose       |
| --------------- | ------------- |
| ARCHITECTURE.md | 全体設計      |
| REQUIREMENTS.md | 要件定義      |
| CLI.md          | CLI仕様       |
| SCHEMA.md       | DSL仕様       |
| MIGRATION.md    | Migration仕様 |
| GENERATOR.md    | Generator仕様 |
| PROVIDER.md     | Provider仕様  |
| DEVELOPER.md    | 内部設計      |

---

# 22. Definition of Done

各機能は以下を満たした時点で完了とする。

- 実装済み
- Unit Test作成済み
- Integration Test作成済み
- ドキュメント更新済み
- CLI動作確認済み
- AI Agentから利用可能
- サンプルプロジェクトで動作確認済み

---

# 23. Project Vision

gstackはGoogle Workspace専用フレームワークではない。

Schemaを中心としたDSLをコンパイルし、

- アプリケーション
- API
- UI
- インフラ

を統一的に構築するプラットフォームを目指す。

ProviderとGeneratorを交換可能なアーキテクチャにより、長期的には様々な実行環境・技術スタックへ対応できるフレームワークへ発展させる。
