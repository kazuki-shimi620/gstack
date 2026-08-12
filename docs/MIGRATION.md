# Migration Specification

> Documentation index: [`../README.md`](../README.md)

> Version: 0.1.0 (Draft)

---

# 1. Purpose

Migrationは、gstack Schemaの変更を実際のProviderへ安全に反映するための仕組みである。

gstackではMigrationを、SQLファイルの実行機構ではなく、

**Schemaの差分をProvider非依存のOperationへ変換し、それをProviderへ適用する仕組み**

として定義する。

Migration EngineはGoogle Sheets、PostgreSQL、SQLiteなどの具体的な実装を直接認識しない。

Providerが抽象Operationを各実環境へ変換して実行する。

---

# 2. Design Philosophy

Migrationは以下の原則に従う。

* SchemaをSingle Source of Truthとする
* Migration EngineはProvider非依存とする
* 差分を適用前に確認できる
* 破壊的変更を明示する
* Migration履歴を保持する
* 途中失敗時に復旧可能である
* 同一Migrationの重複適用を防止する
* 人間とAIの双方が理解しやすい形式とする

---

# 3. Architecture

```text
Previous Applied Application Model Snapshot
      │
      ▼
Target Application Model
      │
      ▼
   Diff Engine
      │
      ▼
Migration Planner
      │
      ▼
Abstract Operations
      │
      ▼
Provider Interface
      │
      ├── Google Sheets
      ├── PostgreSQL
      ├── SQLite
      └── Other Providers
```

Migration EngineはProvider固有のAPI、SQL、Google Sheets操作を直接実行しない。

---

# 4. Migration Lifecycle

Migrationは以下の流れで実行する。

```text
Schema変更

↓

Schema Validate

↓

Diff

↓

Migration Plan

↓

Migration File生成

↓

Migration Apply

↓

History保存
```

---

# 5. Standard Workflow

新規Modelを作成する。

```bash
gstack schema init users
```

Schemaを編集する。

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

      required: true
```

変更内容を確認する。

```bash
gstack migration plan
```

Migrationを適用する。

```bash
gstack migration apply
```

状態を確認する。

```bash
gstack migration status
```

---

# 6. Migration Commands

## plan

最後に正常適用されたApplication Model Snapshotと現在のTarget Application Modelとの差分から、適用予定Operationを表示する。Provider実状態との差分は別途Driftとして報告する。

```bash
gstack migration plan
```

副作用は発生しない。

---

## apply

未適用MigrationをProviderへ反映する。

```bash
gstack migration apply
```

---

## rollback

適用済みMigrationを取り消す。

```bash
gstack migration rollback
```

---

## status

Migrationの状態を表示する。

```bash
gstack migration status
```

---

## history

Migration履歴を表示する。

```bash
gstack migration history
```

---

# 7. Migration Directory

Migration Fileは以下へ保存する。

```text
migrations/

├── 20260811_000001_create_users.yaml
├── 20260811_000002_add_email_to_users.yaml
└── 20260811_000003_add_user_role.yaml
```

Migration FileはGit管理対象とする。

---

# 8. Migration File

Migration FileはProvider非依存のYAMLとして保存する。

例

```yaml
version: 20260811_000002

name: add_email_to_users

operations:

  - type: add_column

    model: users

    column:

      name: email

      type: string

      required: true

      unique: true
```

Provider固有のSQLやAPI呼び出しは記述しない。

---

# 9. Abstract Operations

Migration EngineはSchema差分からAbstract Operationを生成する。

初期対応Operationは以下とする。

```text
create_model
drop_model

add_column
drop_column
rename_column
alter_column

add_index
drop_index

add_relation
drop_relation
```

将来的には以下を追加できる。

```text
add_constraint
drop_constraint

create_view
drop_view

create_trigger
drop_trigger
```

---

# 10. Create Model

例

```yaml
- type: create_model

  model: users

  definition:

    primaryKey: id

    columns:

      id:

        type: uuid

      name:

        type: string
```

Database ProviderがこのOperationを実際の構造へ変換する。

例

Google Provider

```text
Spreadsheet / Sheet作成
```

PostgreSQL Provider

```text
CREATE TABLE
```

---

# 11. Add Column

例

```yaml
- type: add_column

  model: users

  column:

    name: age

    type: integer
```

---

# 12. Drop Column

例

```yaml
- type: drop_column

  model: users

  column:

    name: temporary_value
```

Dropは破壊的Operationとして扱う。

---

# 13. Rename Column

例

```yaml
- type: rename_column

  model: users

  from: user_name

  to: name
```

Renameは自動判定を原則としない。

Schema差分のみでは、

```text
Drop user_name
Add name
```

なのか、

```text
Rename user_name → name
```

なのかを安全に判断できないためである。

Renameが必要な場合はMigration Plan確認時に明示的に指定できる仕組みを提供する。

---

# 14. Alter Column

例

```yaml
- type: alter_column

  model: users

  column: age

  changes:

    type:

      from: string

      to: integer
```

型変更はデータ損失の可能性があるため、Risk Levelを評価する。

---

# 15. Migration Plan

`migration plan`は最後に正常適用されたApplication Model Snapshotと現在のTarget Application Modelを比較し、実際の適用前に変更内容を表示する。Provider実状態はDrift検出とCapability確認にのみ利用する。

例

```text
Migration Plan

Model: users

+ Add column: email:string
~ Change column: age string -> integer
- Remove column: temporary_value

Risk:

LOW
  Add email

MEDIUM
  Change age type

HIGH
  Remove temporary_value

No changes have been applied.
```

---

# 16. Risk Levels

Migration OperationにはRisk Levelを設定する。

## SAFE

データ損失の可能性が原則ない。

例

* Model作成
* Nullable Column追加
* Index追加

---

## CAUTION

既存データや挙動へ影響する可能性がある。

例

* 型変更
* required変更
* unique追加

---

## DESTRUCTIVE

データ損失が発生する可能性がある。

例

* Model削除
* Column削除

---

# 17. Destructive Operations

破壊的Operationは通常のMigrationと区別する。

例

```bash
gstack migration apply
```

で破壊的変更を検出した場合、警告を表示する。

例

```text
Destructive operations detected.

- Drop column users.temp

Run with:

gstack migration apply --allow-destructive
```

AI Agentが自動実行する場合も、破壊的操作は明示的な許可なしに適用してはならない。

---

# 18. Dry Run

MigrationはDry Runをサポートする。

```bash
gstack migration apply --dry-run
```

Dry RunではProviderへ変更を加えない。

以下のみ実施する。

* Validation
* Migration解析
* Provider Capability確認
* Operation表示

---

# 19. Migration State

Migrationは以下の状態を持つ。

```text
pending

applying

applied

failed

rolled_back
```

---

# 20. Migration History

適用済みMigrationは履歴として保存する。

必要情報

* Version
* Migration Name
* Checksum
* Applied At
* Provider
* Status
* Execution Result

概念例

```yaml
version: 20260811_000002

name: add_email_to_users

checksum: abc123

provider: google

status: applied

appliedAt: 2026-08-11T18:00:00+09:00
```

---

# 21. Migration History Storage

Migration Historyの保存方法はProvider Capabilityに依存する。

Google Providerでは、管理用Sheetまたは管理Metadataを利用できる。

PostgreSQLでは専用Migration Tableを利用できる。

Coreは保存方式を認識しない。

ProviderはMigration State Storage Interfaceを提供する。

---

# 22. Checksum

Migration FileはChecksumを持つ。

適用済みMigration Fileが後から変更された場合、gstackは警告またはエラーを返す。

例

```text
Migration checksum mismatch.

20260811_000002_add_email_to_users

Applied checksum:
abc123

Current checksum:
xyz789
```

適用済みMigration Fileの直接編集は原則禁止する。

---

# 23. Idempotency

同一Migrationは原則として1回のみ適用する。

適用済みVersionを再度実行した場合はスキップする。

例

```text
20260811_000002 already applied.

Skipped.
```

Provider側のOperationも可能な限り冪等性を持つことを推奨する。

---

# 24. Locking

同時Migrationを防止するため、Migration Lockを利用する。

```text
Process A
    ↓
Acquire Migration Lock
    ↓
Apply Migration
    ↓
Release Migration Lock
```

他ProcessがLockを保持している場合はMigrationを開始しない。

---

# 25. Failure Handling

Migration途中で失敗した場合、状態を`failed`として保存する。

例

```text
Migration failed.

Version:
20260811_000004

Completed:
2 / 4 operations

Failed operation:
add_index users.email
```

失敗後に自動で何を戻すかはProvider Capabilityによって異なる。

---

# 26. Atomic Migration

ProviderがTransactionをサポートする場合、Migration全体をTransactionで実行することを推奨する。

```text
Begin

↓

Operations

↓

Commit
```

失敗時

```text
Rollback
```

Google SheetsなどTransactionをサポートしないProviderでは、Operation単位の状態管理を利用する。

---

# 27. Rollback

Migrationは可能な範囲でRollback情報を保持する。

例

```yaml
operations:

  - type: add_column

    model: users

    column:

      name: age

      type: integer

rollback:

  - type: drop_column

    model: users

    column:

      name: age
```

すべてのMigrationが完全にRollback可能とは限らない。

---

# 28. Irreversible Operations

復元不可能なOperationは`irreversible`として扱う。

例

* データを含むColumn削除
* Model削除
* Lossyな型変換

Rollback要求時はエラーまたは警告を返す。

例

```text
Migration cannot be safely rolled back.

Operation:
drop_column users.email

Reason:
Original data is not available.
```

---

# 29. Provider Capability Check

Migration適用前にProviderがOperationをサポートしているか確認する。

例

SchemaではIndexが定義されているが、ProviderがIndexをサポートしない場合。

```text
Provider capability error.

Provider:
google

Unsupported operation:
create_index
```

必要に応じてProviderは、

* Native
* Emulated
* Unsupported

の状態を返す。

---

# 30. Capability Levels

ProviderはOperationごとに以下のCapability Levelを返せる。

```text
native
emulated
unsupported
```

例

```yaml
operations:

  create_model: native

  add_column: native

  create_index: emulated

  transaction: unsupported
```

---

# 31. Schema Snapshot

Migration適用時にSchema Snapshotを保存できることを推奨する。

```text
.gstack/

schema-history/

├── 20260811_000001.yaml
└── 20260811_000002.yaml
```

これにより

* 過去Schemaとの差分確認
* Rollback支援
* Debug

が可能になる。

---

# 32. Application Model Diff

Diff Engineは

```text
Last Applied Application Model Snapshot

vs

Current Target Application Model
```

から変更を検出する。

主な差分

* Model追加
* Model削除
* Column追加
* Column削除
* Property変更
* Index変更
* Relation変更

---

# 33. Rename Detection Policy

Renameの自動推測は初期バージョンでは行わない。

理由

* 誤判定によるデータ損失を防止する
* AIによる過剰な推測を防止する
* Migrationの意図を明確にする

将来的にはRename候補を提示することは許可する。

例

```text
Possible rename detected:

user_name → name

Confirm as rename?
```

ただし、自動適用は行わない。

---

# 34. Migration and Generator

MigrationとGeneratorは独立する。

Migration

```text
Schema
    ↓
Provider State
```

Generator

```text
Schema
    ↓
Source Code
```

Migration成功をGenerator実行の必須条件とはしない。

ただし、Schema Validation成功は両方の前提条件とする。

---

# 35. Migration and Schema

Schemaは現在望ましい状態を表す。

Migrationは、

```text
Previous State
      ↓
Target State
```

への変更過程を表す。

そのためSchemaとMigrationは役割が異なる。

Schema

```text
Desired State
```

Migration

```text
State Transition
```

---

# 36. Provider Separation

Migration FileにはProvider固有処理を書かない。

禁止例

```yaml
sql: ALTER TABLE users ADD COLUMN age INTEGER
```

禁止例

```yaml
googleSheets:

  addColumn: D
```

推奨

```yaml
- type: add_column

  model: users

  column:

    name: age

    type: integer
```

Providerが実際の処理へ変換する。

---

# 37. Security

Migrationでは以下を禁止する。

* Credentialの保存
* Tokenの保存
* Secretの埋め込み
* Provider認証情報の記述

Migration FileはGitで公開可能な状態を保つ。

---

# 38. AI Agent Rules

AI AgentがMigrationを操作する場合、以下を遵守する。

* Apply前にPlanを実行する
* Destructive Operationを自動承認しない
* Renameを推測だけで適用しない
* Failed Migrationを無視しない
* Applied Migration Fileを書き換えない
* Provider Capabilityを確認する

---

# 39. MVP Scope

初期バージョンでは以下を実装する。

Operations

* create_model
* drop_model
* add_column
* drop_column
* alter_column
* rename_column
* add_index
* drop_index
* add_relation
* drop_relation

Commands

* plan
* apply
* status
* history
* rollback

その他

* Migration File
* Checksum
* Risk判定
* Destructive Change検出
* Provider Capability確認

---

# 40. Future Extensions

将来的に追加する候補

* Migration Squash
* Migration Rebase
* Data Migration
* Seed Migration
* Online Migration
* Schema Drift Detection
* Automatic Backup
* Migration Hooks
* Migration Dependencies
* Parallel Migration
* Branch-aware Migration

---

# 41. Out of Scope

初期バージョンでは以下を対象外とする。

* 任意SQL Migration
* Provider固有Script
* 完全な自動Rename判定
* Distributed Transaction
* Zero Downtime Migrationの保証
* Database固有チューニング

---

# 42. Relationship with Other Documents

## Accepted MVP Contract

`DECISIONS.md` D-007とD-008により、適用済みApplication Model snapshotを正式なDiff baselineとし、Provider stateはdrift／capability入力だけに使用する。Migration Planはstable Operation ID、aggregate risk、destructive／reversible情報、warning、capability resultを持つ構造化データとする。Renameには常に明示的なintentが必要である。

Operation scope、stable ID、alter risk、初回baseline、rename intent、capability評価時点の詳細は`DECISIONS.md` D-015からD-020を規範とする。

| Document        | Purpose                   |
| --------------- | ------------------------- |
| ARCHITECTURE.md | 全体アーキテクチャ                 |
| CLI.md          | Migration CLIの公開仕様        |
| REQUIREMENTS.md | システム要件                    |
| SCHEMA.md       | Desired Stateを定義するDSL     |
| PROVIDER.md     | Operationの実行先             |
| GENERATOR.md    | Source Code生成             |
| DEVELOPER.md    | Diff Engine・Planner等の内部設計 |
| ROADMAP.md      | Migration機能の実装計画          |
