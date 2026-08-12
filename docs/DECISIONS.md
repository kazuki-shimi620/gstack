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

## D-015 Migration Operation範囲

MVPのDiff／Plan対象は`create_model`、`drop_model`、`add_column`、`drop_column`、`alter_column`、`rename_column`、`add_index`、`drop_index`、`add_relation`、`drop_relation`とする。`rename_column`はSchema差分から生成せず、明示的なrename intentを検証して、対応するdrop／addを置き換える場合だけ生成する。

## D-016 Stable Operation ID

Operation IDは`<type>:<model>:<subject>`形式のcanonical stringとする。`subject`はModel OperationではModel名、Column／Index／Relation Operationでは対象名を使う。`alter_column`もColumn名単位で1 Operationへ集約する。IDはplan内で一意であり、入力fileや配列の順序に依存してはいけない。衝突はPlanner errorとし、suffixによる暗黙回避を行わない。

## D-017 Alter Column Risk

MVPの`alter_column`は`type`、`required`、`unique`、`enumValues`を比較対象とする。`required: false -> true`、`unique: false -> true`、type変更、Enum value削除は`caution`とする。制約緩和とEnum value追加は`safe`とする。MVPでは既存dataを保持した完全な逆操作を保証できないため、`alter_column`はすべて`reversible: false`とする。Model／Column削除は`destructive`、その他の追加・Index／Relation変更は`safe`とする。

## D-018 Migration Baseline

初回Migrationはprevious snapshotを`null`で表し、空のApplication Modelとは区別する。`null` baselineからはtarget内の各Modelに対する`create_model`だけを生成し、そのdefinitionにField、Index、Relationを含める。同じModelに対する冗長なadd Operationは生成しない。通常のDiff baselineは最後に正常適用されたApplication Model snapshotだけとする。

## D-019 Rename Intent

rename intentはplan入力の構造化データとして`{ model, from, to }`を受け取る。`from`がprevious Modelに存在し、targetには存在せず、`to`がtargetに存在し、previousには存在しない場合だけ有効とする。1つのColumnを複数intentで参照してはいけない。型やconstraintに差がある場合、rename後に別の`alter_column`を生成する。無効または曖昧なintentはerrorとし、drop／addへsilent fallbackしない。

## D-020 Migration Capability Result

pure Diff／PlannerはProviderを受け取らず、各Operationのcapabilityを`not_evaluated`として保持する。Provider選択後のcapability checkが`native | emulated | unsupported`へ置き換え、aggregate planを再評価する。未評価またはunsupportedのOperationをApplyしてはいけない。

## D-021 Primary Key変更

MVPでは既存ModelのPrimary Key変更を禁止する。Diff Engineは変更を黙って無視したり、通常の`alter_column`へ変換したりせず、stable code `MIGRATION_PRIMARY_KEY_CHANGE_UNSUPPORTED`を持つerrorを返す。変更が必要な場合は明示的なModel再作成または将来の専用Operation設計を必要とする。初回`create_model`ではtargetのPrimary Keyをそのままdefinitionへ含める。

## D-022 Migration FileとChecksum

Migration File versionはlocal timezoneに依存しないUTC由来の`YYYYMMDD_NNNNNN`形式、nameはsnake_caseとする。Fileは`formatVersion: 1`、`version`、`name`、`checksum`、`operations`を持つProvider非依存YAMLとする。checksumは`formatVersion`、`version`、`name`、`operations`をkey順にcanonical JSON化したUTF-8 byte列のSHA-256 lowercase hexとし、`checksum`自身とYAML formatting／commentを対象外とする。読込時はchecksum一致を必須とし、未知keyやProvider固有keyを拒否する。

## D-023 Migration History Contract

History entryは`version`、`name`、`checksum`、`status`、Operation総数／完了数、開始／完了／Rollback時刻、失敗Operation ID、安全なerror code、適用済みApplication Model snapshotを持つProvider非依存データとする。状態遷移は`pending -> applying -> applied | failed`と`applied -> rolled_back`だけを許可する。`applied`では全Operation完了、完了時刻、target snapshotを必須とする。Rollback時は元の完了時刻を保持し、`rolledBackAt`を別途記録する。`failed`では失敗Operation IDとsafe error codeを必須とし、secretを含み得る生message／stack traceを保存しない。時刻は呼出側からISO 8601 UTC文字列として注入する。Provider名や保存先はHistory entryではなくProvider側storage contextが所有する。
