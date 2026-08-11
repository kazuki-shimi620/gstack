# Schema Specification

> Documentation index: [`../README.md`](../README.md)

> Version: 0.2.0 (Draft)

---

# 1. Purpose

Schemaはgstackにおける**唯一の設計情報（Single Source of Truth）**である。

Schemaはデータベース定義ではない。

Schemaは**アプリケーション全体を表現する宣言型DSL（Domain Specific Language）**であり、Database・Migration・API・UI・Validation・Permission・Documentation・AI Contextを生成するための唯一の情報源である。

利用者はSchemaのみを編集し、その他のコードはGeneratorによって生成されることを基本方針とする。

---

# 2. Design Philosophy

Schemaは以下を満たすことを目的とする。

* 人が読みやすい
* AIが理解しやすい
* Git管理しやすい
* 差分が分かりやすい
* 宣言型である
* Providerに依存しない
* 再生成可能である

---

# 3. Schema Lifecycle

```text
Schema

↓

Validate

↓

Diff

↓

Migration Plan

↓

Migration Apply

↓

Generate

↓

Deploy
```

---

# 4. Directory Structure

```text
schema/

├── users.yaml
├── products.yaml
├── orders.yaml
└── settings.yaml
```

基本方針

* 1 Model = 1 File
* Gitで差分管理しやすい構成とする

---

# 5. Schema Structure

Schemaは以下のレイヤーで構成する。

```text
Schema

├── model
├── database
├── api
├── ui
├── validation
├── permissions
├── workflow
├── events
└── metadata
```

各レイヤーは独立した責務を持つ。

---

# 6. Layer Responsibilities

## model

アプリケーションのドメインを定義する。

例

* 名前
* 表示名
* 説明

---

## database

永続化方法を定義する。

例

* Columns
* Primary Key
* Index
* Relations

---

## api

公開APIを定義する。

例

* CRUD
* Endpoint
* Version
* OpenAPI

---

## ui

画面生成に利用する。

例

* 一覧表示
* フォーム
* ソート
* 検索
* フィルター

---

## validation

入力検証を定義する。

例

* 必須
* 最大文字数
* 最小値
* 正規表現

---

## permissions

権限を定義する。

例

* Read
* Create
* Update
* Delete

---

## workflow

将来的なワークフローを定義する。

例

* 承認
* メール送信
* バッチ

---

## events

イベントを定義する。

例

* Created
* Updated
* Deleted

---

## metadata

Frameworkで利用しない自由情報。

Plugin等で利用できる。

---

# 7. Example Schema

```yaml
name: users

description: User Management

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

    email:

      type: string

      unique: true

    role:

      type: enum

      values:

        - admin

        - user

  indexes:

    - name: users_email_unique

      columns:

        - email

      unique: true

api:

  resource: users

  create: true

  update: true

  delete: false

ui:

  list:

    columns:

      - name

      - email

      - role

  form:

    fields:

      - name

      - email

      - role

validation:

  name:

    minLength: 1

    maxLength: 100

permissions:

  read:

    - admin

    - user

  create:

    - admin

  update:

    - admin

workflow:

  enabled: false

events:

  enabled: false

metadata:

  owner: team-a
```

---

# 8. Supported Types

初期対応

```text
string
text
integer
number
boolean
uuid
date
datetime
json
enum
```

将来対応

```text
array
object
reference
binary
file
image
decimal
```

---

# 9. Validation Rules

Schema Validationでは以下を確認する。

* YAML構文
* 必須項目
* 型
* Primary Key
* Index
* Relation
* Enum
* Validation
* 命名規則
* Provider非依存性

---

# 10. Naming Convention

Model

```text
snake_case
```

例

```text
users

order_items
```

Column

```text
snake_case
```

例

```text
created_at

updated_at
```

---

# 11. Generated Artifacts

Schemaから生成されるもの。

Database

* Migration
* Schema

Backend

* API
* Routing
* Validation

Frontend

* React Components
* Forms
* Tables

Common

* TypeScript
* OpenAPI
* Documentation
* AGENTS.md
* AI Documentation

---

# 12. Dependency Rule

Schemaの依存関係は以下とする。

```text
model

↓

database

↓

api

↓

ui
```

逆方向の依存は禁止する。

例

* UIはDatabaseを利用できる
* DatabaseはUIを参照してはいけない

---

# 13. Compatibility

Schemaは後方互換性を考慮する。

Databaseへ直接反映されることはない。

必ず

```text
Schema

↓

Migration Plan

↓

Migration Apply
```

を経由する。

---

# 14. Best Practices

推奨

* 1モデル1ファイル
* Descriptionを書く
* Validationを書く
* Enumを積極的に利用する
* UI定義を書く
* API定義を書く

非推奨

* SQLを書く
* Google APIを書く
* Provider固有設定を書く
* 実装ロジックを書く

---

# 15. Future Extensions

将来的に追加予定。

* Composite Key
* Composite Index
* Generated Column
* Trigger
* View
* Workflow
* Event Handler
* Audit Log
* Soft Delete
* Versioning
* Scheduler
* AI Rules

---

# 16. Relationship with Other Documents

## Accepted MVP Contract

The exact MVP grammar, Schema version placement, defaults, Relation/Index/Validation rules, one-file-one-document policy, and unknown-key policy are fixed by `DECISIONS.md` D-002 through D-006. Those decisions take precedence over permissive draft examples. In particular, Index examples require a stable `name`; Parser does not apply defaults or resolve relations.

| Document        | Purpose    |
| --------------- | ---------- |
| ARCHITECTURE.md | 全体設計       |
| CLI.md          | CLI仕様      |
| REQUIREMENTS.md | 要件         |
| PROVIDER.md     | Provider仕様 |
| GENERATOR.md    | コード生成仕様    |
| DEVELOPER.md    | 内部設計       |
| ROADMAP.md      | 開発ロードマップ   |
