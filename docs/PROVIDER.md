# Provider Specification

> Documentation index: [`../README.md`](../README.md)

> Version: 0.2.0 (Draft)

---

# 1. Purpose

Providerは、gstack Coreと外部サービスを接続するための抽象化レイヤーである。

gstackではProviderを**プラグインとして扱う**。

CoreはGoogle Workspace、PostgreSQL、SQLiteなどの具体的な外部サービスを直接認識しない。

すべての外部サービスへのアクセスはProvider Interfaceを通じて実行する。

これにより以下を実現する。

- Providerの差し替え
- Providerの追加・削除
- Coreと外部サービスの分離
- テスト容易性
- 拡張性
- サードパーティProviderの作成

---

# 2. Design Philosophy

Providerは以下の原則に従う。

- CoreはProvider Interfaceのみを利用する
- Providerはプラグインとして独立する
- Coreは特定Providerに依存しない
- Provider固有のコードはProvider内部へ閉じ込める
- Provider同士の依存を原則禁止する
- Providerは必要なCapabilityのみ実装できる
- ProviderはCLIからインストール・削除・選択できる
- サードパーティProviderを追加可能とする

---

# 3. Architecture

```text
Developer
    │
    ▼
gstack CLI
    │
    ▼
gstack Core
    │
    ▼
Provider Registry
    │
    ▼
Provider Interface
    │
    ├── Google Provider Plugin
    ├── SQLite Provider Plugin
    ├── PostgreSQL Provider Plugin
    ├── Cloud Run Provider Plugin
    └── Third Party Provider Plugin
            │
            ▼
      External Services
```

CoreはProvider InterfaceとProvider Registryのみを認識する。

具体的なProvider実装については認識しない。

---

# 4. Provider Plugin Model

Providerは独立したパッケージとして提供する。

例

```text
@gstack/provider-google
@gstack/provider-sqlite
@gstack/provider-postgres
@gstack/provider-cloudrun
```

サードパーティProviderも同じInterfaceを実装することで利用可能とする。

例

```text
@example/gstack-provider-example
```

---

# 5. Provider Installation

ProviderはCLIからインストールできる。

```bash
gstack provider install google
```

内部的には対応するProvider Packageをインストールする。

例

```text
google
    ↓
@gstack/provider-google
```

---

## Install Examples

```bash
gstack provider install google

gstack provider install sqlite

gstack provider install postgres
```

---

## Third Party Provider

サードパーティProviderはPackage名を指定してインストールできる。

```bash
gstack provider install @example/gstack-provider-example
```

---

# 6. Provider Removal

ProviderはCLIから削除できる。

```bash
gstack provider remove google
```

現在利用中のProviderを削除する場合はエラーまたは確認を行う。

---

# 7. Provider List

インストール済みProviderを表示する。

```bash
gstack provider list
```

例

```text
Installed Providers

google       1.0.0
sqlite       1.0.0
postgres     0.3.0
```

---

# 8. Provider Selection

利用するProviderを設定する。

```bash
gstack provider use google
```

ただし、gstackでは1つのProviderだけを選択するとは限らない。

用途ごとに異なるProviderを利用できる構造を許可する。

例

```text
Database    → Google Sheets
API         → Apps Script
Auth        → Google OAuth
Storage     → Google Drive
Deploy      → Apps Script
```

将来的には以下のような構成も可能とする。

```text
Database    → PostgreSQL
API         → Cloud Run
Auth        → Google OAuth
Storage     → S3
Deploy      → Cloud Run
```

---

# 9. Provider Categories

ProviderはCapability単位で機能を提供する。

主要Capabilityは以下とする。

- Database
- API
- Authentication
- Storage
- Deploy

1つのProviderが複数Capabilityを実装してもよい。

---

# 10. Database Provider

Database Providerはデータ永続化を担当する。

責務

- Database作成
- Table作成
- Table削除
- Column追加
- Column削除
- Column変更
- Index管理
- Query実行
- Migration適用

Interface例

```text
createDatabase()

createTable()

dropTable()

addColumn()

removeColumn()

renameColumn()

createIndex()

dropIndex()

executeMigration()
```

---

# 11. API Provider

API ProviderはBackend APIの公開を担当する。

責務

- API公開
- Endpoint作成
- Routing
- Request処理
- Response処理

Interface例

```text
deployApi()

publishEndpoint()

removeEndpoint()

getApiStatus()
```

---

# 12. Authentication Provider

Authentication Providerは認証機能を担当する。

責務

- Login
- Logout
- Token取得
- Token更新
- Credential管理
- Authentication Status

Interface例

```text
login()

logout()

refresh()

status()
```

---

# 13. Storage Provider

Storage Providerはファイル保存を担当する。

責務

- Upload
- Download
- Delete
- List
- Metadata取得

Interface例

```text
upload()

download()

delete()

list()

metadata()
```

---

# 14. Deploy Provider

Deploy Providerはアプリケーションのデプロイを担当する。

責務

- Build
- Upload
- Deploy
- Publish
- Rollback
- Status取得

Interface例

```text
build()

deploy()

publish()

rollback()

status()
```

---

# 15. Provider Interface

すべてのProviderは共通のBase Provider Interfaceを実装する。

最低限以下を提供する。

```text
initialize()

validate()

connect()

health()

disconnect()

dispose()

getCapabilities()
```

Capability固有のInterfaceは別途実装する。

---

# 16. Capability Interface

Providerは必要なCapabilityだけを実装できる。

例

Google Provider

```text
Database
API
Auth
Storage
Deploy
```

SQLite Provider

```text
Database
```

Cloud Run Provider

```text
API
Deploy
```

---

# 17. Capability Declaration

Providerは自身が提供するCapabilityを宣言する。

例

```yaml
name: google

version: 1.0.0

capabilities:
  database: true

  api: true

  auth: true

  storage: true

  deploy: true
```

SQLite

```yaml
name: sqlite

version: 1.0.0

capabilities:
  database: true

  api: false

  auth: false

  storage: false

  deploy: false
```

---

# 18. Provider Manifest

各ProviderはProvider Manifestを持つ。

例

```yaml
name: google

package: '@gstack/provider-google'

version: 1.0.0

gstack:
  minimumVersion: 0.1.0

capabilities:
  database: true

  api: true

  auth: true

  storage: true

  deploy: true
```

Provider ManifestはProviderの発見・検証・互換性確認に利用する。

---

# 19. Provider Registry

gstackはインストールされたProviderをRegistryで管理する。

Registry例

```yaml
providers:
  google:
    package: '@gstack/provider-google'

    version: 1.0.0

    enabled: true

  sqlite:
    package: '@gstack/provider-sqlite'

    version: 1.0.0

    enabled: true
```

RegistryはProviderの実装そのものを保持しない。

Provider Packageへの参照のみを管理する。

---

# 20. Project Provider Configuration

プロジェクト単位で利用するProviderを設定する。

例

```yaml
providers:
  database:
    provider: google

  api:
    provider: google

  auth:
    provider: google

  storage:
    provider: google

  deploy:
    provider: google
```

将来的には以下のような混在構成も許可する。

```yaml
providers:
  database:
    provider: postgres

  api:
    provider: cloudrun

  auth:
    provider: google

  storage:
    provider: s3

  deploy:
    provider: cloudrun
```

---

# 21. Provider Lifecycle

Providerは以下のLifecycleに従う。

```text
Discover
    ↓
Load Manifest
    ↓
Compatibility Check
    ↓
Initialize
    ↓
Validate
    ↓
Connect
    ↓
Execute
    ↓
Disconnect
    ↓
Dispose
```

---

# 22. Provider Discovery

CoreはProviderを直接importしない。

Provider RegistryおよびProvider Manifestから動的にProviderを発見する。

```text
Provider Registry

↓

Provider Loader

↓

Provider Package

↓

Provider Interface
```

---

# 23. Provider Configuration

Provider固有設定はSchemaへ記述しない。

SchemaはProvider非依存である必要がある。

Provider固有設定はProject ConfigまたはProvider Configで管理する。

例

```text
gstack.yaml
```

または

```text
.gstack/

providers/

google.yaml
```

---

# 24. Schema and Provider Separation

Schemaでは以下のようなProvider固有情報を禁止する。

非推奨

```yaml
database:
  googleSheetId: xxxxx
```

推奨

Schema

```yaml
database:
  columns:
    id:
      type: uuid
```

Provider Config

```yaml
spreadsheetId: xxxxx
```

これにより同じSchemaを別Providerでも利用できるようにする。

---

# 25. Google Provider

Google ProviderはGoogle Workspace向けの標準Providerである。

Package

```text
@gstack/provider-google
```

利用するサービス

- Google Sheets
- Apps Script
- Google Drive
- Google OAuth

---

# 26. Google Database Capability

Google ProviderのDatabase CapabilityではGoogle Sheetsを利用する。

概念上、

```text
Database
    ↓
Spreadsheet

Table
    ↓
Sheet

Column
    ↓
Column

Record
    ↓
Row
```

として扱う。

利用者はGoogle Sheets APIを直接操作しない。

---

# 27. Google API Capability

Google ProviderのAPI CapabilityではApps Scriptを利用する。

主な責務

- Apps Script Project生成
- API Code配置
- Web App Deployment
- Endpoint公開
- Deployment更新

---

# 28. Google Authentication Capability

Google OAuthを利用する。

主な責務

- Login
- Token取得
- Token更新
- Scope管理
- Credential管理

認証情報はSchemaへ保存しない。

---

# 29. Google Storage Capability

Google DriveをStorageとして利用する。

主な責務

- File Upload
- File Download
- File Delete
- Metadata取得

---

# 30. Google Deploy Capability

Google Workspaceへのデプロイを担当する。

対象

- Apps Script
- Google Sheets
- Google Drive
- 必要な設定

デプロイは以下のCLIから実行する。

```bash
gstack deploy
```

---

# 31. Error Handling

Providerは共通Errorへ変換してCoreへ返す。

例

```text
ProviderError

ProviderNotFoundError

ProviderCompatibilityError

AuthenticationError

ConnectionError

ValidationError

MigrationError

DeployError
```

外部サービス固有のErrorをそのままCLIへ返さない。

必要に応じて元のError情報をDebug情報として保持する。

---

# 32. Compatibility

Providerは対応するgstack VersionをManifestで宣言する。

例

```yaml
gstack:
  minimumVersion: 0.1.0

  maximumVersion: 1.x
```

互換性がない場合はProviderをLoadしない。

---

# 33. Security Requirements

Providerは以下を遵守する。

- CredentialをSchemaへ保存しない
- Tokenをログへ出力しない
- SecretをGenerated Codeへ埋め込まない
- 必要最小限の権限のみ要求する
- Provider固有のSecret管理方式を利用できる

---

# 34. Dependency Rules

依存関係は以下とする。

```text
CLI

↓

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

禁止

```text
CLI → Google API

Core → Google API

Core → PostgreSQL Driver

Core → Provider実装

Provider → CLI

Schema → Provider固有設定
```

---

# 35. Provider Development Rules

Provider開発者は以下を遵守する。

- Provider Interfaceを実装する
- Provider Manifestを提供する
- Capabilityを明示する
- Coreへ依存しない
- CLIへ依存しない
- Provider単体でテスト可能にする
- External Service固有のErrorを共通Errorへ変換する
- Credentialを安全に扱う
- SchemaへProvider固有仕様を持ち込まない

---

# 36. Third Party Provider

gstackはサードパーティProviderを許可する。

サードパーティProviderは公式Providerと同じInterfaceを利用する。

例

```bash
gstack provider install @example/gstack-provider-example
```

公式ProviderとサードパーティProviderはProvider Manifestによって識別する。

gstack Coreは両者を同一のProviderとして扱う。

---

# 37. Official Providers

初期実装

| Provider         | Package                 | Status |
| ---------------- | ----------------------- | ------ |
| Google Workspace | @gstack/provider-google | MVP    |

将来候補

| Provider   | Package                   | Status  |
| ---------- | ------------------------- | ------- |
| SQLite     | @gstack/provider-sqlite   | Planned |
| PostgreSQL | @gstack/provider-postgres | Planned |
| Cloud Run  | @gstack/provider-cloudrun | Planned |
| AWS        | @gstack/provider-aws      | Planned |

---

# 38. CLI Commands

Provider関連CLI

```bash
gstack provider list

gstack provider install google

gstack provider remove google

gstack provider use google

gstack provider info google
```

将来的にはCapabilityごとの設定も提供する。

```bash
gstack provider use postgres --for database

gstack provider use cloudrun --for api

gstack provider use google --for auth
```

---

# 39. Out of Scope

Providerは以下を担当しない。

- Schema解析
- Schema Validation
- Migration Plan生成
- Code Generation
- CLI解析
- Domain Logic
- UI生成

これらはCoreまたはGeneratorの責務とする。

---

# 40. Relationship with Other Documents

## Accepted MVP Contract

`DECISIONS.md` D-011 and D-012 clarify that Core may know Provider interfaces/registry abstractions but not concrete implementations. Providers declare Database/API/Authentication/Storage/Deploy capabilities and Migration support per abstract Operation as `native`, `emulated`, or `unsupported`.

Google Sheetsへの最初のMigration writeは`DECISIONS.md` D-053を規範とする。`create_model`をatomicなbatchUpdate、管理用Developer Metadata、明示resumeによるidempotency確認で実装する。Google固有request、quota、markerはGoogle Provider内に閉じ込め、Migration EngineやMigration Fileへ書かない。

Google Sheetsの`add_column`は`DECISIONS.md` D-056を規範とする。連続headerの末尾へ既存dataを削除せず列を追加し、列範囲の管理marker、atomic batch、非retry write、明示resume時のstate再照合を使う。`rename_column`、`drop_column`、`drop_model`はそれぞれD-082、D-083、D-084を規範とし、破壊操作はCoreの明示承認に加えてProviderでも厳密な事前状態を検証する。それ以外のGoogle Migration Operationは、個別契約が確定するまで`unsupported`とする。

Google Sheetsの`alter_column`は`DECISIONS.md` D-085を規範とする。Providerは既存cellを変換せず、対象列の全rowが変更後のField定義と互換であることを検査してからcolumn markerを記録する。新規writeのvalidationは生成Apps Script runtimeが担い、Google Sheets Data Validationを暗黙のschema constraintとして扱わない。strict adapter、値非露出error、再開時marker照合、標準Runtime接続を検証し、Manifestでは`emulated`と宣言する。

Google SheetsのIndex／Relationは`DECISIONS.md` D-086／D-087を規範とする。Sheets native indexや外部キーが存在するとは表明せず、Providerによる既存data検査、管理marker、生成Apps Script runtimeによる将来write検証を一体で満たす場合だけ`emulated`と宣言する。複合unique違反や参照不整合を暗黙修復せず、Relation deleteはRESTRICTとする。adapterと生成runtimeの検証が完了するまではManifestの`unsupported`を維持する。

MVPのProvider Manifest、factory／session lifecycle、Secret Resolver境界、safe health、memory Registryは`DECISIONS.md` D-036を規範とする。package install、dynamic import、credential storageはこのFoundationに含めない。

## Standard Google Credential Injection

公式Runtimeは`DECISIONS.md` D-057に従い、local／CIとも環境変数をSecret sourceとして使用する。`gstack.yaml`にはcredentialそのものではなく参照名だけを書く。

```yaml
providers:
  google:
    enabled: true
    configuration:
      spreadsheetId: spreadsheet-id
      appsScriptProjectId: script-id
      driveFolderId: folder-id
      authentication:
        mode: user_oauth
        credentialSecret: GSTACK_GOOGLE_CREDENTIAL
```

参照先の値は次のkeyだけを持つ1行JSONである。以下は形式説明用の明らかなplaceholderであり、実credentialをrepositoryへ保存してはいけない。

```json
{
  "formatVersion": 1,
  "type": "authorized_user",
  "clientId": "example-client-id",
  "clientSecret": "example-client-secret",
  "refreshToken": "example-refresh-token"
}
```

local shellではsessionまたは利用中のsecret managerから`GSTACK_GOOGLE_CREDENTIAL`を注入し、CIではmasked secretを同名の環境変数へ割り当てる。gstackは`.env`を自動読込せず、credential fileやtoken cacheをProject内へ作らない。`provider validate`はoffline検証なのでsecretを読まず、実接続を伴う`provider health`、Migration read／applyなどで初めて解決する。

| Document        | Purpose                      |
| --------------- | ---------------------------- |
| ARCHITECTURE.md | 全体設計・Providerの位置付け |
| CLI.md          | Provider操作を含むCLI仕様    |
| REQUIREMENTS.md | システム要件                 |
| SCHEMA.md       | Provider非依存のDSL仕様      |
| GENERATOR.md    | コード生成仕様               |
| MIGRATION.md    | Migration仕様                |
| DEVELOPER.md    | Provider Loader等の内部実装  |
| ROADMAP.md      | Provider追加計画             |
