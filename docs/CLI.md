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

- Schema
- Migration
- Config
- Environment Variables

---

## Human & AI Friendly

CLIは人間だけではなくAI Agentからも利用されることを想定する。

そのため

- コマンド体系
- 出力形式
- エラー内容

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

- 新規プロジェクトを作成する

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

Parserで失敗した場合はResultの`level`を`syntax`、構文通過後は`semantic`として、同じCore Resultでsemantic validationまで実行する。

Project rootが明示されていない場合、CLIは現在Directoryから親方向へ最も近い`gstack.yaml`を探索する。見つからない場合はConfiguration Error（Exit Code 3）を返す。

検証内容

- YAML構文
- 型
- Relation
- 命名規則
- 重複

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

MVP実装では標準RuntimeのMigration HistoryをbaselineとしてProvider非依存Planを生成し、設定済みProvider ManifestのOperation capability評価を反映する。Google ProviderではHistory参照のためDrive APIへread-only requestを行うが、Sheets／Driveを変更しない。`--json`でmachine-readable envelopeを返す。

---

### apply

Migrationを適用する。

```bash
gstack migration apply --file migrations/20260813_000001_initial.yaml --dry-run

gstack migration apply \
  --file migrations/20260813_000001_initial.yaml \
  --approval <plan-fingerprint>
```

副作用

- Database更新
- Provider更新

MVPではFileを明示し、最初に`--dry-run`でchecksum、現在Schemaとの一致、History、Provider capability、Plan fingerprintを確認する。実行時は同じfingerprintを`--approval`へ渡す。破壊的Planは`--allow-destructive`、failed Migrationの再開は`--resume`も必要とする。暗黙の最新File選択、`--yes`、複数File一括適用、MCP Applyは提供しない。規範は`DECISIONS.md` D-055とする。

---

### rollback

Migrationを取り消す。

```bash
gstack migration rollback \
  --file migrations/20260813_000001_initial.yaml \
  --dry-run
```

MVPではlatest applied Historyと明示Fileが一致する場合のread-only previewだけを提供する。実RollbackはProvider固有の逆操作と承認契約が確定するまで公開しない。規範は`DECISIONS.md` D-058とする。

---

### history

Migration履歴を表示する。

```bash
gstack migration history
```

version順のHistoryをread-onlyで表示する。`--json`を利用できる。

---

### status

Migration状態を表示する。

```bash
gstack migration status
```

状態別件数、最新attempt、最新applied Migrationをread-onlyで表示する。`--json`を利用できる。

---

## generate

コード生成を行う。

```bash
gstack generate
```

設定済みのbuilt-in Generatorを実行し、`generated/`配下とManifestを更新する。実行前に副作用なしで確認する場合:

```bash
gstack generate --dry-run
gstack generate --dry-run --json
```

`--dry-run`はwrite／deleteを含むGeneration Planを返すがfilesystemを変更しない。`--json`はD-013のenvelope内に`dryRun`と構造化Planを返す。`generator`未設定またはSchema Validation失敗時は生成せずerrorにする。CLIはArtifact内容や削除対象を独自計算せず、Coreのpreview／generate APIへ委譲する。

生成対象

- API
- Frontend
- TypeScript
- Validation
- OpenAPI
- Documentation
- AI Documentation

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

## plugin

明示allowlistからload・検証されたPlugin Manifestを読み取り専用で表示する。Plugin configurationの値は表示しない。

### list

```bash
gstack plugin list
gstack plugin list --json
```

### install / remove

installはexact SemVerを必須とし、removeはPluginが無効かつconfiguration削除済みの場合だけ計画・実行できる。最初にdry-runで現在stateに結び付くfingerprintを確認する。

```bash
gstack plugin install @example/generator@1.2.3 --dry-run
gstack plugin remove @example/generator --dry-run
gstack plugin install @example/generator@1.2.3 --approval <fingerprint>
gstack plugin remove @example/generator --approval <fingerprint>
```

Planは現在の`gstack.yaml`と`package.json`に結び付くfingerprint、npm command、変更前後のallowlistを返す。dry-runはpackageやfilesystemを変更しない。実変更は同じPlanのfingerprintを必須とし、npm lifecycle scriptを無効化する。

### package validate

Plugin packageをpublishする前に、package directoryでread-only検証を行う。

```bash
gstack plugin package validate
gstack plugin package validate --directory ./packages/my-plugin --json
```

package.json、root export、型宣言、`gstackPlugin`、Manifest identity／version／互換性、`npm pack --dry-run --ignore-scripts`の収録物を検証する。entryや型宣言がpackageに含まれない場合と、`.env`、`.npmrc`、credential JSON、秘密鍵らしいfileが含まれる場合は失敗する。publish自体は実行しない。

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

### validate

Provider固有configurationを外部変更なしで検証する。

```bash
gstack provider validate google
gstack provider validate google --json
```

### health

明示的に指定したProviderのread-only health checkを実行する。

```bash
gstack provider health google
gstack provider health google --json
```

### initialize

空のApps Script projectをgstack管理対象にする。必ずpreview後に同じ状態のfingerprintを明示承認する。

```bash
gstack provider initialize google --dry-run
gstack provider initialize google --approval <fingerprint>
```

手書きsourceが存在するprojectや既に管理済みのprojectは変更しない。

`list`、`info`、`validate`、`health`、Google向け`initialize`が現在実装済みである。`install`、`remove`、`use`はpackage管理と状態変更の安全契約が確定するまで未実装とする。

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
gstack dev --port 3000
```

loopback専用のin-memory APIを起動する。終了するとdataは破棄され、Google Providerやlocal filesystemは変更しない。

---

## deploy

現在のProviderへデプロイする。

```bash
gstack deploy
```

MVPのGoogle Deployは先に無副作用previewを行い、表示されたbuild fingerprintを明示承認する。

```bash
gstack deploy --dry-run
gstack deploy --approval <fingerprint>
```

dry-runはfilesystemやProviderを変更しない。実Deployはgstack管理済みApps Script projectだけを対象とし、未管理projectを暗黙初期化しない。

## build

生成物とDeploy bundleを構築・検証する。

```bash
gstack build --dry-run
gstack build
```

dry-runはfilesystemを変更しない。通常実行は`generated/`だけを書き換え、Providerへは接続しない。

---

## doctor

開発環境を診断する。

```bash
gstack doctor
```

確認内容

- CLI
- Config
- Provider
- Authentication
- Required Files

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

- Schema
- Config
- Environment Variables
- Migration Files

---

## Output

CLIが生成するもの

- Generated Source Code
- Migration Plan
- Documentation
- Logs
- Exit Code

Coreは構造化されたResultを返し、CLI FormatterがHuman outputまたはJSONへ変換する。`--json`指定時、通常結果はstdoutへ`{ "ok": true, "data": ..., "warnings": [] }`形式で出力する。

`--json`指定時の想定内Errorはstderrへ`{ "ok": false, "error": { ... } }`形式で出力する。Core/libraryの例外やstack traceをそのまま公開しない。詳細Contractは`DECISIONS.md` D-013を参照する。

---

## Side Effects

CLIが変更を加える対象

- Generated Files
- Database
- Provider
- Deploy Target

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

- 同一Major Versionでは互換性を維持する
- 破壊的変更はMajor Versionでのみ実施する
- Deprecatedなコマンドは一定期間維持する

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

| Document        | Description                  |
| --------------- | ---------------------------- |
| ARCHITECTURE.md | 全体アーキテクチャ・設計思想 |
| SCHEMA.md       | Schema(YAML)仕様             |
| PROVIDER.md     | Provider実装仕様             |
| GENERATOR.md    | コード生成仕様               |
| DEVELOPER.md    | 内部設計・開発者向け仕様     |
| ROADMAP.md      | 今後の実装計画               |
