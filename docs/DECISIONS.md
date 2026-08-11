# gstack MVP確定事項

> ドキュメント一覧: [`../README.md`](../README.md)

> Status: 確定済み。以下はMVP実装の規範として一括承認された判断である。各subsystemの詳細ドキュメントは引き続き正式な仕様であり、判断を変更する場合は両方を更新すること。

## D-001 Project Config

`gstack.yaml`は必須であり、Project Rootを示すmarkerとする。MVPの形式は次のとおり。

```yaml
version: 1
name: sample-app
schemaVersion: 1
schema:
  directory: schema
```

4項目はすべて必須とし、未知のkeyはerrorとする。pathはProject Rootからの相対pathとする。ProviderとGeneratorのsectionは、将来optionalかつ型付けされたsectionとして追加できるが、secretをConfigの有効値にしてはいけない。環境変数はsecretや運用上のoverrideを提供できるが、application semanticsを再定義してはいけない。具体的なoverride名は各機能の追加時に定義する。

## D-002 Schema Version

Schema versionは各Model fileではなく、`gstack.yaml`の`schemaVersion`で一度だけ宣言する。必須項目とし、未対応versionはConfiguration Errorとする。MVPは整数version `1`だけをsupportする。

## D-003 MVP Schema Grammar

- 1つのYAML fileには、正確に1つのYAML documentと1つのModelを記述する。
- rootの必須keyは`name`、`model`、`database`とする。
- rootのoptional keyは`description`、`api`、`ui`、`validation`、`permissions`、`workflow`、`events`、`metadata`とする。
- `description`はroot levelに置き、`model.displayName`を必須とする。
- `database.primaryKey`と、空でない`database.columns` mappingを必須とする。Primary Keyを暗黙生成してはいけない。
- すべてのColumnで`type`を必須とする。`SCHEMA.md`の初期対応typeだけを許可する。Enum Columnは空でなく重複のない`values` sequenceを必須とする。
- Indexは安定した`name`と空でない`columns` sequenceを必須とし、`unique`のdefaultを`false`とする。
- MVP Relationは`database.relations`配下の名前付きmappingとする。それぞれ`type: belongs_to`、local `field`、target `model`、target `references`を必須とする。その他のRelation kindは将来対応とする。
- Validation keyは既存Column名でなければならない。string／text ruleは`minLength`、`maxLength`、`pattern`、numeric ruleは`min`、`max`とする。`required`はColumn propertyのままとする。
- MVPの`api` keyは`resource`、`create`、`update`、`delete`とする。
- MVPの`ui`はoptionalな`list.columns`と`form.fields` sequenceを持つ。
- MVPの`permissions` keyは`read`、`create`、`update`、`delete`とし、それぞれrole名のsequenceを持つ。
- MVPの`workflow`と`events`は`enabled` flagだけを持つ。具体的なWorkflow／Event定義は将来対応とする。
- framework管理下のすべてのlevelで未知のkeyをerrorとする。`metadata`だけをopen mappingとする。
- boolean feature flagのdefaultは`false`、optional collectionのdefaultは空とする。defaultはParserではなくSemantic Analyzerが適用する。

## D-004 ASTとIR

MVPでは、gstackが所有する構文表現を1つだけ持ち、ASTと呼ぶ。旧ドキュメントの「Raw IR」はこのASTを指す。ASTはfile identity、source range、YAML構造、明示的に記述された値を保持する。default、解決済みRelation、semantic normalization、Provider data、YAML library固有nodeを含めてはいけない。必要性が実証されるまで第2のIRを導入しない。

## D-005 Validationの責務

```text
YAML Parser       -> YAML 1.2構文とduplicate key
AST Builder       -> node形状と許可された構文
Semantic Analyzer -> type、name、default、duplicate、index、enum、relation
Core              -> validateSchema use caseの統合
```

MVPでは独立したValidation Engineを設けない。Validation levelは`syntax`、`semantic`、将来の`provider`とする。

## D-006 Application Model

正規化され、immutableかつProvider非依存のModelは、Models、Fields、Indexes、Relations、API、UI、Permissions、Workflows、Events、Metadata、optionalな診断用source referenceを持つ。欠落したoptional sectionは空の値へ正規化する。YAML library、filesystem handle、CLI、MCP、具体的Provider、Generator template、runtime state、secretの型を含めてはいけない。

MVPのApplication rootはSchema version、application name、Models、application level Metadataを持つ。各Modelは正規化済みのFields、Primary Key、Indexes、Relations、API、UI、Permissions、Workflow、Events、Metadataを所有する。欠落collectionは空のreadonly collection、feature flagは`false`、未指定description／resourceは`null`、未指定validation ruleは`null`とする。Metadataは再帰的にimmutableなYAML互換scalar／sequence／mapping値だけに制限する。診断用source referenceはsource identityとpositionだけを持つ。

## D-007 Migration Baseline

正式な比較baselineは、最後に正常適用されたApplication Model snapshotとする。Provider introspectionはdrift検出とcapability checkに使用するが、暗黙のdesired stateやmigration baselineとして扱ってはいけない。Migration historyには適用されたsnapshotを記録する。

## D-008 Migration Plan

Planは、順序付きOperation、集約された`safe | caution | destructive` risk、destructive flag、warning、reversibility、capability resultを持つ構造化データとする。Operationは安定したIDを持つ。Renameを暗黙に推測・適用してはいけず、明示的なmigration intentを必須とする。

## D-009 Generator Input

Generator inputはApplication Model、Generator Config、Templateとする。Generatorはraw YAML／ASTやlive Provider／Database stateを入力にしてはいけない。

## D-010 Generated Codeの所有権

Generatorが所有するのは`generated/`だけとする。`app/`や`custom/`へ書き込んではいけない。Generated Artifact Manifestへ所有する出力を記録し、古いfileの削除は過去にmanifestへ記録されたpathだけに限定する。

## D-011 CoreとProvider

「CoreはProviderを知らない」とは、CoreがProvider interfaceやregistry abstractionへ依存できる一方、具体的なProvider実装へ依存し、importし、設定し、名前を参照してはならないことを意味する。

## D-012 Provider Capability

top-level capabilityはDatabase、API、Authentication、Storage、Deployとする。Migration supportは抽象Operationごとに`native`、`emulated`、`unsupported`のいずれかを宣言する。

## D-013 Machine-readable Envelope

CLI JSONとMCP Toolのstructured contentは同じinner envelopeを使用する。

成功:

```json
{ "ok": true, "data": {}, "warnings": [] }
```

失敗:

```json
{ "ok": false, "error": { "code": "...", "category": "...", "message": "..." } }
```

CLIはstdout／stderrとexit codeを管理し、MCPはprotocol contentと`isError`を管理する。human formatterはAdapterが所有する。

## D-014 Package公開方針

公開package候補は`@gstack/core`、`@gstack/cli`、`@gstack/mcp`、`@gstack/provider`、具体的なProvider packageとする。Parser、Analyzer、Schema、Config、Application packageは内部実装packageのままとする。MVPの全packageは1つの同期versionを使用する。明示的な例外がない限り、public stabilityは1.0から開始する。
