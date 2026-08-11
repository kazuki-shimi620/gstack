# CLI Specification

> Documentation index: [`../README.md`](../README.md)

> Version: 0.1.0 (Draft)

---

# 1. Purpose

gstack CLI は **gstack Framework の主要なHuman-facing操作インターフェース**である。

開発者は Provider や Google API を直接操作することなく、CLI を利用してプロジェクトの作成・設計・生成・デプロイを行う。

CLI は **利用者向けの仕様（Contract）** を定義するものであり、内部実装については定義しない。CLIはMCPや将来のToolと同じCore Programmatic APIを利用し、Business Logicを再実装しない。

内部アーキテクチャや実装の詳細については `DEVELOPER.md` を参照する。

---

# 2. CLI Philosophy

## CLI First

すべての操作はCLIから実行できることを前提とする。

ブラウザやGUIへの依存を最小限とし、ターミナルだけで開発を完結できることを目標とする。

---

## Predictable

同じ入力に対して同じ結果を生成する。

CLIの実行結果は常に予測可能であり、生成物は再生成できることを保証する。

---

## Stateless

CLIは状態を保持しない。

状態は以下のみが管理する。

* Schema
* Migration
* Config
* Environment Variables

---

## Human & AI Friendly

CLIは人間だけではなくAI Agentからも利用されることを想定する。

そのため

* コマンド体系
* 出力形式
* エラー内容

は一貫性を維持する。

---

# 3. Command Structure

```text
gstack

├── init
│
├── schema
│
├── migration
│
├── generate
│
├── provider
│
├── auth
│
├── dev
│
├── deploy
│
├── doctor
│
└── version
```

---

# 4. Command Specification

## init

プロジェクトを初期化する。

### Example

```bash
gstack init my-app
```

### Input

なし

### Output

```
my-app/

app/

schema/

migrations/

generated/

docs/

gstack.yaml

package.json
```

### Side Effects

* 新規プロジェクトを作成する

---

## schema

Schemaを管理する。

### init

新しいSchemaを作成する。

```bash
gstack schema init users
```

### Output

```
schema/users.yaml
```

---

### validate

Schemaを検証する。

```bash
gstack schema validate
```

Machine-readable output:

```bash
gstack schema validate --json
```

初期実装ではYAML syntax validationのみを行い、Resultの`level`へ`syntax`を設定する。Semantic Analyzer実装後にsemantic validationを同じCore Resultへ統合する。

Project rootが明示されていない場合、CLIは現在Directoryから親方向へ最も近い`gstack.yaml`を探索する。見つからない場合はConfiguration Error（Exit Code 3）を返す。

検証内容

* YAML構文
* 型
* Relation
* 命名規則
* 重複

---

### diff

Schemaの差分を表示する。

```bash
gstack schema diff
```

---

### format

Schemaを整形する。

```bash
gstack schema format
```

---

## migration

Migrationを管理する。

### plan

適用予定の変更を表示する。

```bash
gstack migration plan
```

例

```
Create users

Add column age

Remove column temp
```

副作用

なし

---

### apply

Migrationを適用する。

```bash
gstack migration apply
```

副作用

* Database更新
* Provider更新

---

### rollback

Migrationを取り消す。

```bash
gstack migration rollback
```

---

### history

Migration履歴を表示する。

```bash
gstack migration history
```

---

### status

Migration状態を表示する。

```bash
gstack migration status
```

---

## generate

コード生成を行う。

```bash
gstack generate
```

生成対象

* API
* Frontend
* TypeScript
* Validation
* OpenAPI
* Documentation
* AI Documentation

---

### frontend

```bash
gstack generate frontend
```

---

### backend

```bash
gstack generate backend
```

---

### docs

```bash
gstack generate docs
```

---

## provider

Providerを管理する。

### list

```bash
gstack provider list
```

---

### use

```bash
gstack provider use google
```

---

### install

```bash
gstack provider install postgres
```

---

### info

```bash
gstack provider info google
```

---

## auth

認証情報を管理する。

### login

```bash
gstack auth login
```

---

### logout

```bash
gstack auth logout
```

---

### status

```bash
gstack auth status
```

---

## dev

ローカル開発環境を起動する。

```bash
gstack dev
```

---

## deploy

現在のProviderへデプロイする。

```bash
gstack deploy
```

---

## doctor

開発環境を診断する。

```bash
gstack doctor
```

確認内容

* CLI
* Config
* Provider
* Authentication
* Required Files

---

## version

CLIバージョンを表示する。

```bash
gstack version
```

---

# 5. Standard Workflow

一般的な開発フロー

```text
gstack init

↓

gstack schema init

↓

gstack schema validate

↓

gstack migration plan

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

# 6. CLI Contract

CLIは利用者との契約である。

内部実装が変更されても、CLIの振る舞いは可能な限り維持する。

---

## Input

CLIが扱う入力

* Schema
* Config
* Environment Variables
* Migration Files

---

## Output

CLIが生成するもの

* Generated Source Code
* Migration Plan
* Documentation
* Logs
* Exit Code

Coreは構造化されたResultを返し、CLI FormatterがHuman outputまたはJSONへ変換する。`--json`指定時、通常結果はstdoutへ`{ "ok": true, "data": ..., "warnings": [] }`形式で出力する。

`--json`指定時の想定内Errorはstderrへ`{ "ok": false, "error": { ... } }`形式で出力する。Core/libraryの例外やstack traceをそのまま公開しない。詳細Contractは`DECISIONS.md` D-013を参照する。

---

## Side Effects

CLIが変更を加える対象

* Generated Files
* Database
* Provider
* Deploy Target

---

## Exit Codes

| Code | Meaning              |
| ---- | -------------------- |
| 0    | Success              |
| 1    | Unknown Error        |
| 2    | Validation Error     |
| 3    | Configuration Error  |
| 4    | Authentication Error |
| 5    | Provider Error       |
| 6    | Migration Error      |

---

# 7. Compatibility Policy

CLIは後方互換性を重視する。

* 同一Major Versionでは互換性を維持する
* 破壊的変更はMajor Versionでのみ実施する
* Deprecatedなコマンドは一定期間維持する

---

# 8. Future Commands

以下は将来的な追加候補であり、本バージョンでは対象外とする。

```text
gstack plugin

gstack test

gstack seed

gstack ai

gstack mcp

gstack logs

gstack cache

gstack monitor
```

---

# 9. Relationship with Other Documents

本ドキュメントはCLIの利用仕様のみを定義する。

その他の仕様は以下を参照する。

| Document        | Description    |
| --------------- | -------------- |
| ARCHITECTURE.md | 全体アーキテクチャ・設計思想 |
| SCHEMA.md       | Schema(YAML)仕様 |
| PROVIDER.md     | Provider実装仕様   |
| GENERATOR.md    | コード生成仕様        |
| DEVELOPER.md    | 内部設計・開発者向け仕様   |
| ROADMAP.md      | 今後の実装計画        |
