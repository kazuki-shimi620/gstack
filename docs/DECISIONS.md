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
generator:
  formatVersion: 1
  types: true
  validation: true
  api: true
  backend: true
  frontend: true
  openapi: true
  documentation: true
  aiDocumentation: true
```

基本4項目はすべて必須とし、未知のkeyはerrorとする。pathはProject Rootからの相対pathとする。`generator`はoptionalだが、存在する場合は上記8項目をすべて必須とし、未知keyを拒否する。sectionがないProjectはGenerator未設定として扱い、暗黙defaultで生成してはいけない。Provider sectionは将来optionalかつ型付けされたsectionとして追加できる。secretをConfigの有効値にしてはいけない。環境変数はsecretや運用上のoverrideを提供できるが、application semanticsを再定義してはいけない。

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

History entryは`version`、`name`、`checksum`、`status`、Operation総数／完了数、開始／完了／Rollback時刻、失敗Operation ID、安全なerror code、適用済みApplication Model snapshotを持つProvider非依存データとする。状態遷移は`pending -> applying -> applied | failed`と`applied -> rolled_back`だけを許可する。`applied`では全Operation完了、完了時刻、checksum付きtarget snapshotを必須とする。Rollback時は元の完了時刻を保持し、`rolledBackAt`を別途記録する。`failed`では失敗Operation IDとsafe error codeを必須とし、secretを含み得る生message／stack traceを保存しない。時刻は呼出側からISO 8601 UTC文字列として注入する。Provider名や保存先はHistory entryではなくProvider側storage contextが所有する。

## D-024 SnapshotとHistory Storage

Application Model snapshotは`formatVersion: 1`、`application`、canonical SHA-256 `checksum`を持つJSON互換データとする。checksumはMigration Fileと同じcanonical JSON規則を使い、読込時に未知root key、format、checksumを検証する。Historyの`appliedSnapshot`にはこのchecksum付きsnapshotを保存する。Migration packageは`get`、`list`、`save`だけのasync History Storage portを定義し、保存先は実装しない。Repository serviceはversion重複を拒否し、既存entry更新時のchecksum変更を禁止し、list結果をversion順へ正規化する。

## D-025 Migration Capability評価

Providerは各Operation IDに対して`native | emulated | unsupported`のいずれかを返し、Migration packageのpure functionがPlanへ反映する。評価結果はPlan内の全Operationを過不足なく1回ずつ含まなければならず、未知ID、重複、欠落をstable error codeで拒否する。集約状態は`not_evaluated | supported | unsupported`とし、Operationが存在する未評価Planまたは1件でも`unsupported`を含むPlanは適用不可とする。Operationが0件のPlanだけはProvider評価なしで適用可能とする。具体的Providerの呼出し、選択、credentialはこの評価処理へ含めない。

## D-026 Generated ArtifactとManifest

Generatorのpure outputは`path`、UTF-8 `content`、SHA-256 lowercase hex `checksum`を持つArtifactとする。`path`はProject Root相対のPOSIX形式で、必ず`generated/`直下またはその子孫を指し、空segment、`.`、`..`、absolute path、backslashを禁止する。同じpathの重複はcontentが同一でもerrorとし、Artifactはpath順へ正規化する。

Generated Artifact Manifestは`formatVersion: 1`と、contentを含まない`path`／`checksum` entryを持つ。Manifest自身は`generated/.gstack-manifest.json`へ保存するが、Manifest entryには含めない。再生成Planは全Artifactのwriteと、直前の有効なManifestに存在して新Manifestに存在しないpathのdeleteを返す。delete対象はManifestに記録された`generated/`配下に限定し、filesystemを走査して所有権を推測してはいけない。Artifact生成、Plan計算、Manifest serialize／parseはpureに保ち、実際のfilesystem write／deleteは別のWriter adapterが担当する。

## D-027 Type Generator

MVP Type GeneratorはApplication Modelだけを入力とし、Modelごとに`generated/types/<model.name>.ts`と、全Modelを再exportする`generated/types/index.ts`を生成する。Type名はsnake_caseのModel nameをPascalCaseへ変換し、Field名は安全なTypeScript property表現としてJSON string literalで出力する。ModelとFieldはApplication Modelの順序に依存せずname順で出力する。

型mappingは`string | text | uuid | date | datetime -> string`、`integer | number -> number`、`boolean -> boolean`、`json -> unknown`、`enum -> JSON string literalのunion`とする。`required: false`のFieldはoptional property、`required: true`は必須propertyとする。出力はUTF-8、LF、末尾newlineを持ち、自動生成・編集禁止headerを付ける。Type Generatorはfilesystemへ書き込まず、Artifact inputを返す。

## D-028 Validation Generator

MVP Validation GeneratorはApplication Modelだけを入力とし、`generated/validation/runtime.ts`、Modelごとの`generated/validation/<model.name>.ts`、`generated/validation/index.ts`を生成する。外部Validation libraryへ依存せず、各Model validatorは`unknown`を受け取り、成功時は型付きvalue、失敗時はfield path、stable code、messageを持つissueのreadonly配列を返す。生成validatorは値を変更せず、default適用やcoercionを行わない。

検証対象はobject形状、required、Field type、Enum value、`minLength`、`maxLength`、`pattern`、`min`、`max`とする。`integer`はfinite integer、`number`はfinite number、`json`はundefined以外のJSON互換値、その他はApplication Modelのtype mappingに対応するprimitiveを要求する。未知propertyはMVPでは保持を許可し、Generator側でSchema semanticsを追加しない。Model／Field／Enumの出力順序は決定的にし、filesystem書込は共通Writerへ委譲する。

## D-029 OpenAPI Generator

MVP OpenAPI GeneratorはApplication ModelだけからOpenAPI 3.1 JSONを`generated/openapi/openapi.json`へ生成する。`api.resource`がnullのModelは公開しない。resourceがあるModelはcollection `GET`を常に公開し、`api.create`でcollection `POST`、`api.update`でitem `PATCH`、`api.delete`でitem `DELETE`を追加する。item pathは`/{resource}/{primaryKey}`とし、path parameter名にはApplication ModelのPrimary Key名を用いる。単一取得のflagはSchemaに存在しないため、MVPではitem `GET`を生成しない。

Component Schemaは全Field、required配列、Enum、Validation制約を表現する。`uuid`、`date`、`datetime`はOpenAPI formatを付け、`integer`／`number`／`boolean`／object／stringへ決定的にmappingする。Request bodyはModel schemaへのreferenceとし、CRUDのresponseはportableな最小statusだけを宣言する。path、schema、property、requiredはname順で出力し、Provider／runtime framework／credential／business logicを含めない。

## D-030 Documentation Generator

MVP Documentation GeneratorはApplication Modelだけから`generated/docs/models.md`を生成する。Application名、Model一覧、各Modelのdescription、Primary Key、Fields、Indexes、Relations、公開API operationをMarkdownで記載する。Metadata、credential、Provider state、runtime state、source filesystem pathは出力しない。Model、Field、Index、Relation、role／columnのsequenceはnameまたは値で決定的にsortする。

Markdown table cell内のbackslash、pipe、改行はescape／HTML表現へ変換し、Application Modelの文字列をMarkdown構造として解釈させない。空sectionは明示的に「なし」と表現する。Documentation GeneratorはArtifact inputだけを返し、filesystemやTemplate loaderへ依存しない。

## D-031 AI Documentation Generator

MVP AI Documentation Generatorは`generated/ai/PROJECT_CONTEXT.md`と`generated/ai/AGENTS.md`を生成する。Project ContextはApplication名、Schema version、ModelごとのPrimary Key、Field、Relation、API、UI、Permission、Workflow／Event availabilityを機械的かつ決定的に記述する。Metadata、source path、credential、secret、Provider／runtime state、推測したbusiness ruleは含めない。

生成`AGENTS.md`は`generated/ai/`配下だけを対象とし、生成物であること、編集禁止、Schema／Application Modelがsource of truthであること、secret禁止、破壊操作禁止、manual codeへ内容を推測転記しないことを記載する。Project Rootの手動`AGENTS.md`や`app/`／`custom/`へ書き込んではいけない。Markdown escapeと順序はD-030と同じ規則を用いる。

## D-032 Generator ConfigとOrchestration

MVPのprogrammatic Generator Configは`formatVersion: 1`と、`types`、`validation`、`api`、`backend`、`frontend`、`openapi`、`documentation`、`aiDocumentation`のbooleanを持つ。すべて必須とし、Core側defaultを推測しない。Generator Engineは有効なproducerを固定順序で実行し、Artifact path重複を共通Planで拒否して、直前Manifestに基づくwrite／delete／new manifestを1つのGeneration Planとして返す。

Orchestratorの入力はApplication Model、Config、optionalな直前Manifestだけとする。Templateを必要としないbuilt-in producerだけをMVPで統合し、API runtime／UIなどTemplate必須のproducerを有効化したように見せてはいけない。Orchestratorはfilesystem、Provider、Core、CLIへ依存せず、同一入力から同一Planを返す。

## D-033 Generated Artifact Writer

filesystem Writerは明示的なProject Rootと検証済みGeneration Planを受け、`generated/`配下だけを変更する。Project Rootおよび既存path componentのsymlinkを拒否し、pathの文字列検証だけで所有範囲を判断しない。writeは同一directory内の一時fileへUTF-8で書き、renameで置換する。deleteはPlanの`deletes`だけを対象とし、directory再帰削除やfilesystem走査による追加削除を行わない。

処理順序はArtifact write、stale file delete、Manifest writeとし、Manifestは最後にatomic更新する。失敗時はerrorを返し、新Manifestを成功状態として書いてはいけない。空directoryのcleanupはMVPでは行わない。WriterはProvider、Schema、Application Modelを解釈せず、secretをlogへ出力しない。

## D-034 API Contract Generator

MVP API Generatorはruntime framework非依存のTypeScript contractを`generated/api/contracts.ts`へ生成する。`api.resource`があるModelだけを対象とし、collection list、optional create、optional update／deleteを、HTTP method、path、operation ID、request type、response typeを持つreadonly route定義として出力する。request／response typeは`generated/types`のModel型を参照し、update requestは`Partial<Model>`、delete responseは`void`とする。

Generatorはrouting framework、server bootstrap、handler implementation、database access、authentication、authorization、business logic、Provider固有codeを生成しない。単一取得はSchemaにflagがないため生成しない。生成contractは後続のruntime／Template adapterが実装する境界であり、Application Modelにない挙動を推測してはいけない。

## D-035 React UI Generator

MVP標準UI TemplateはReact function componentとし、`generated/frontend/<model.name>/list.tsx`と`form.tsx`、`generated/frontend/index.ts`を生成する。`ui.list.columns`が空のModelはListを、`ui.form.fields`が空のModelはFormを生成しない。Listはreadonly Model itemsをpropsで受け取るsemantic table、Formは各Fieldを`string | boolean`で保持するdraft valueと`onSubmit(draft)`をpropsで受け取るcontrolled formとする。draftからModelへのparse／validationは生成Validation境界の利用者が担当する。

Field inputはbooleanをcheckbox、textをtextarea、Enumをselect、その他をinputへmappingし、number／integer／date／datetimeには標準HTML input typeを付ける。値のparse／validationは生成Validation moduleを利用できる境界に留め、component内でnetwork、Provider、database、routing、authentication、authorization、business logicを実装しない。stylingはclassName hookだけを提供し、CSS frameworkやinline designを固定しない。表示column／form fieldはApplication Modelに宣言された順序を保持する。

## D-036 Provider Foundation

`@gstack/provider`は具体Providerが実装しCoreが参照できるProvider非依存の公開候補contract packageとする。Manifestは`formatVersion: 1`、stable `name`、npm `packageName`、Provider `version`、minimum gstack version、Database／API／Authentication／Storage／Deployのboolean、全MVP Migration Operation typeに対する`native | emulated | unsupported` supportを持つ。未知key、不正name／package／version、Migration supportの欠落・重複を拒否する。

Provider factoryはManifestと`initialize(context)`を持ち、contextはProject Root、secretを含まないProvider config、注入されたSecret Resolverだけを受ける。Sessionは`validate()`、`health()`、`dispose()`を提供し、healthは`healthy | degraded | unavailable`とsafe codeだけを返す。生error、credential、stackを公開しない。Registryはfactoryをnameで登録・取得・一覧化し、重複登録を拒否してname順へ正規化する。MVP Registryはmemory上の参照だけを管理し、package install／dynamic import／credential保管を行わない。

## D-037 Provider Catalog Read Model

CoreおよびMCPが参照するProvider情報は、Registry内のFactoryを直接公開せず、Manifest由来のimmutableな`ProviderSummary`へ射影する。CatalogはProvider一覧をname順で返し、単一Providerおよびtop-level capabilityを参照できる。Summaryにはpackage名、version、minimum gstack version、capability、Migration Operation supportだけを含め、初期化関数、Session、Provider config、credential、secret、healthのlive stateを含めない。

## D-038 Provider Lifecycle Orchestration

Providerのvalidation／healthは、明示的なProvider名と、Project Root、secretを含まないconfiguration、注入済みSecret Resolverを受ける短命な操作とする。Runtimeは操作ごとにFactoryを初期化し、1つのSession操作を実行し、成功・失敗にかかわらずSessionを1回破棄する。SessionやSecret Resolverの値をresultへ含めない。未登録、初期化、操作、不正result、破棄の失敗はstable codeとsafe messageを持つRuntime errorへ変換し、Provider由来の生messageを公開しない。Validation issueとhealth codeも契約に沿う形式を検証してimmutableなcopyを返す。Coreへはcontextを固定したInspection Serviceを注入し、Core自身はProvider configurationやSecret Resolverを組み立てない。

## D-039 Google Provider Initial Contract

`@gstack/provider-google`はGoogle固有codeを閉じ込める独立packageとし、Database、API、Authentication、Storage、Deploy capabilityを宣言する。Google Sheets／Apps Script／DriveのMigration操作はadapter実装とintegration testが揃うまで全て`unsupported`とし、Manifestだけでsupport済みと表現しない。

初期configurationは`spreadsheetId`、`appsScriptProjectId`、`driveFolderId`、`authentication`の4つを必須とし、未知keyを拒否する。MVPのauthentication modeはApps Script API実行とも互換性がある`user_oauth`だけとし、service accountを暗黙fallbackにしない。`authentication.credentialSecret`はSecret Resolverへ渡す参照名でありcredential値ではない。offline validationはGatewayやSecret Resolverを呼ばない。外部接続は注入可能な`GoogleWorkspaceGateway`だけが担当し、Provider Sessionのhealth操作から有効なconfiguration、Secret Resolver、operation別のcredential requestを受ける。Google SDK、OAuth token保存、Migration Apply、Deployはこのsliceに含めない。

OAuth scopeはoperationごとの最小集合としてProvider内で固定する。health／Database readは`spreadsheets.readonly`、Database writeは`spreadsheets`、Storage readは`drive.metadata.readonly`、Storage writeは`drive.file`、Script read／writeは`script.projects.readonly`／`script.projects`、Deployは`script.deployments`を要求する。広いDrive scopeや複数Capabilityのscopeを常時一括要求しない。Refresh tokenを含むcredential materialはSecret Resolverの実装が安全な外部storageから供給し、gstack config、Schema、Migration、History、logへ保存しない。

## D-040 Google Sheets Metadata Read Boundary

Google Database capabilityの最初の外部Read境界は、configurationで指定された1つのSpreadsheetのmetadata取得だけとする。結果はSpreadsheet ID、title、optional locale／time zone、およびSheet ID、title、row／column countを持つimmutableなread modelへ正規化し、Sheet title／ID順で決定的に返す。Cell value、record、formula、format、permission、credentialは含めない。

Google SDK／HTTPは注入可能なGatewayが所有し、Serviceは`database_read`のcredential requestとSecret Resolverを渡す。Gateway resultはSpreadsheet ID一致、型、正のgrid size、Sheet ID／title一意性を検証する。Gateway errorと不正resultはそれぞれstable codeとsafe messageへ変換し、生errorを公開しない。このRead境界はSchemaとのdiffやMigration baselineを作らず、Google Sheetsへのwriteも行わない。

## D-041 Google OAuth Credential Boundary

MVPのSecret Resolver payloadはUTF-8 JSONの`formatVersion: 1`、`type: "authorized_user"`、`clientId`、`clientSecret`、`refreshToken`だけを許可し、未知keyと保存済みaccess tokenを拒否する。Provider Configにはpayloadを置かず、Secret Resolver keyだけを保持する。Credential Serviceはoperation別scopeとstrictにparseしたcredentialを注入済みToken Gatewayへ渡し、access token、UTC expiry、granted scopeだけの短命なmemory resultを返す。

Token Gateway resultはaccess token、未来のexpiry、要求scope包含を必須とし、不正resultを拒否する。返却順序はscopeを重複除去してsortする。gstackはrefresh後のcredentialやaccess tokenをfilesystem、config、Schema、Migration、History、Manifest、logへ永続化しない。Secret解決、parse、refresh、result検証の失敗はstable codeとsafe messageへ変換し、secret key名、credential内容、Google error messageを公開しない。Local／CIの具体Secret ResolverとOAuth HTTP adapterは別adapterとして実装する。

## D-042 Google HTTP Safety Contract

Google API HTTP境界はHTTPSだけを許可し、requestごとにretry可能性を明示する。既定timeoutは1 attemptあたり10秒、最大3 attempts、retry delayは250ms、1000msとし、network／timeoutおよび429、500、502、503、504だけを再試行する。非idempotentまたは安全性が確認されていないrequestは`retryable: false`とし、自動再試行しない。Retry-After対応とjitterは将来のrate limit policyで追加するまで推測実装しない。

401、403、404、429、5xx、その他HTTP failure、network failureはstable code、HTTP statusまたはnull、安全な固定messageへ変換する。Response body、Google error payload、Authorization header、URL query、credential、tokenをerror messageやlogへ含めない。Transport、wait、timeoutは注入可能にし、外部networkなしでattempt回数とdelayを検証する。

Fetch Transportはredirectを拒否し、AbortSignalによるattempt timeoutを適用する。Response bodyは既定1 MiBを上限とし、Content-Lengthと実byte数の両方を検証する。上限超過はretryしないstable errorとし、bodyを公開しない。

OAuth refresh adapterは`https://oauth2.googleapis.com/token`へform-urlencoded POSTを行い、同じrefresh tokenによる交換は安全に繰り返せるためretryableとする。ResponseはBearer token、1以上の`expires_in`、space-delimited scope、最大2048 byteのaccess tokenを必須とし、現在時刻からUTC expiryを計算する。未知response fieldと返却refresh tokenは保持しない。Credential Serviceが最終的に要求scope包含を検証する。

## D-043 Google Sheets HTTP Metadata Adapter

Sheets metadata adapterはCredential Serviceから得た短命access tokenをAuthorization headerだけに設定し、URL queryへ含めない。`GET https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}`をretryable requestとして呼び、`includeGridData=false`と明示的fields maskでSpreadsheet ID、title、locale、time zone、Sheet ID／title／grid sizeだけを要求する。Spreadsheet IDはpath segmentとしてpercent encodeする。

Google REST responseのnested propertiesをProvider内のflat metadata Gateway resultへ変換し、cell dataなど未知fieldは捨てる。その後D-040のDatabase Read ServiceがID一致、一意性、型、grid sizeを検証する。JSON parse／shape failure、OAuth failure、HTTP failureは既存の安全なProvider境界を通し、body、token、credentialを公開しない。

## D-044 Default Google Provider Composition

標準composition rootはFetch Transport、Google HTTP Executor、OAuth HTTP Gateway、Sheets HTTP GatewayをGoogle Provider package内で組み立て、Core／CLI／MCPへGoogle固有dependencyを要求しない。Fetch、clock、wait、timeout、attempt policyはtestおよびhost要件のため注入可能にするが、安全な既定値はD-042に従う。

初期health checkはconfigured Spreadsheetのmetadata取得をend-to-endで行い、成功時だけ`healthy / GOOGLE_SHEETS_READY`を返す。Credential未検出／不正、認証失敗、権限拒否、Spreadsheet未検出、不正responseは`unavailable`、rate limit／一時的API障害は`degraded`へ分類する。Health resultはsafe codeだけを返し、HTTP status、Google payload、credential、token、生errorを含めない。このhealthはread-onlyであり、Sheets、Drive、Apps Scriptを変更しない。

## D-045 Google Drive Folder Metadata Boundary

Storage capabilityの最初のRead境界は、configurationで指定された1つのDrive folderのmetadata取得だけとする。結果はfolder ID、name、sort済みparent IDs、trashed、`canAddChildren`／`canListChildren`だけを持つimmutable read modelとし、file内容、子file一覧、permission、owner、email、credentialを含めない。ID一致、Google Drive folder MIME type、型、parent ID一意性をstrictに検証する。

REST adapterは`GET https://www.googleapis.com/drive/v3/files/{folderId}`を`drive.metadata.readonly` scopeと短命Bearer tokenで呼び、fields maskを上記metadataに限定する。Shared Drive互換のため`supportsAllDrives=true`を指定する。Folder IDはpath encodeし、tokenをqueryへ置かない。このsliceはfolderの作成、移動、list、upload、download、deleteを行わない。

## D-046 Google Apps Script Project Metadata Boundary

API／Deploy capabilityの最初のRead境界は、configurationで指定された1つのApps Script projectのmetadata取得だけとする。結果はscript ID、title、optional parent ID、create／update UTC timestampだけを持つimmutable read modelとし、source file、manifest content、deployment、version、metric、execution result、creator／last modifier profileを含めない。ID一致、型、timestampをstrictに検証する。

REST adapterは公式`projects.get` endpointを`script.projects.readonly` scopeと短命Bearer tokenでretryable GETし、fields maskを`scriptId,title,parentId,createTime,updateTime`へ限定する。Script IDはpath encodeし、tokenをqueryへ置かない。このsliceはproject作成、source取得／更新、version／deployment操作、script実行を行わない。

## D-047 Google Workspace Aggregate Health

標準Provider healthはSheets、Drive、Apps Scriptのconfigured resourceをこの順にread-only metadata checkし、3件全て成功した場合だけ`healthy / GOOGLE_WORKSPACE_READY`を返す。各checkは必要なoperation別scopeだけで別々に短命access tokenを取得する。1件目の失敗で停止し、未確認resourceを成功扱いしない。

Not Foundはresource別のsafe code、credential／authentication／permission／rate limit／一時障害／不正responseはD-044と同じ分類にする。Aggregate resultにresource metadata、HTTP status、外部error、token、credentialを含めない。Healthは各resourceを変更せず、Migration supportやDeploy readinessを意味しない。

## D-048 Project Provider Configuration

`gstack.yaml`のoptionalな`providers`はProvider nameをkeyとするmappingとし、各entryは必須の`enabled: boolean`と`configuration: mapping`だけを持つ。Provider nameはlowercase kebab-case、読込結果はname順のimmutable arrayとする。Config packageはconfigurationをJSON互換のopaque dataとして保持し、Googleその他の具体Provider keyを解釈しない。Provider固有packageが自身のconfigurationをstrictに検証する。

Provider package名、Factory、credential値、access／refresh tokenはProject Configへ保存しない。SecretはProvider configuration内の参照名だけを許可する責任を具体Providerが持つ。未知Providerの解決、package install／dynamic import、複数Providerのcapability routingは標準composition／Plugin Loaderの責務とし、Config LoaderやCoreへ実装しない。

## D-049 Standard Runtime Composition

`@gstack/runtime`は公式配布物のcomposition rootとしてConfig、Core、Provider Registry、公式具体Providerを接続する唯一のpackageとする。Core、Config、Schema、Migration、Generatorはruntimeや具体Providerへ依存しない。CLIとMCPの実entry pointはRuntime経由でProjectをloadするが、presentation／protocolとbusiness logicの境界は維持する。

MVP Runtimeはenabledな`google`だけを明示的allowlistで登録し、未知enabled Providerを安全に拒否する。disabled Providerは登録／初期化しない。Package install、dynamic import、Marketplace、capability routingは行わない。Google InspectionにはProject Root、Googleのopaque configuration、Environment Secret Resolverを注入する。Environment Resolverはuppercase snake-case名だけを解決し、値を列挙、log、返却modelへ公開しない。将来のlocal／CI Secret Resolverは同じportの別adapterとする。

## D-050 Google Migration Capability Mapping

Google ProviderのMigration capability結果はManifestのoperation type別supportを唯一のsourceとして、入力Planの全Operation IDへ順序を保持して射影する。結果をMigration packageの共通`applyCapabilityResults`へ渡し、欠落／重複／未知IDの検証とPlan集約を再利用する。Google Provider側で独自Planや独自applicability規則を実装しない。

初期状態では全Operationを`unsupported`とし、Google Sheets write adapter、Operationごとのidempotency、lock、resume、approval、rollbackが実装・検証されるまでManifest supportを変更しない。D-053の条件を満たした`create_model`とD-056の条件を満たした`add_column`は`native`へ昇格済みであり、他Operationは`unsupported`を維持する。概念上実現可能なOperationを先に`native`／`emulated`と表示してはいけない。

## D-051 Migration Rollback Plan

Rollback Planは適用時に使った検証済みMigration Fileと、その直前の正常適用Application Model snapshotから都度生成する。Migration File format v1へrollback Operationを重複保存せず、forward Operationとrollback Operationの不整合を作らない。初回Migrationのrollback targetは`null` baselineであり、空Application Modelへ置き換えない。

Rollback Operationは実際に完了したforward Operationだけを対象に、forward実行順の逆順で生成する。`reversible: false`を1件でも含む場合は安全なRollback Planを生成せず、明示的な`MIGRATION_IRREVERSIBLE` errorとする。Rollbackは常に手動要求とし、Apply失敗時の暗黙自動Rollbackは行わない。Provider transactionが失敗全体をatomicに取り消した場合だけ、完了Operation数を進めずProvider結果として記録する。

## D-052 Migration Apply Safety Protocol

Applyは、checksum検証、History整合性、Provider capability評価済みかつ全件supported、明示的approval、排他lock取得の順に事前条件を満たしてから、Planのcanonical順で逐次実行する。dry-runは同じ事前検証とPlan表示を行うが、approval、lock、History更新、Provider writeを行わない。lock keyはProviderのstorage contextとMigration versionから構成し、lockを取得できない場合は一切変更しない。lock leaseは成功・失敗を問わず`finally`で解放する。

approvalはversion、Migration checksum、評価済みPlan fingerprintへ結び付け、内容変更後に再利用できないようにする。破壊的Planは通常approvalに加えて`allowDestructive: true`を必須とする。CLIの対話確認はこの契約への入力adapterであり、Core／Migration Engineがpromptを所有しない。MCPからのApplyは別途危険操作の承認設計が確定するまで提供しない。

部分失敗は`failed` Historyと完了Operation数を保存する。再開は同一version／checksum／Plan fingerprintに対する明示的なresume要求と新しいapproval、lock取得を必須とし、先頭から再実行せず、完了数に対応する次のOperationから続行する。failed Operation自体は未完了として再実行する。HistoryとPlanのOperation数、順序、checksumが一致しない場合は再開を拒否する。Provider Operationはこの契約に加えて個別のidempotency keyを受け取れる必要があり、具体Providerで保証できるまでsupportを有効化しない。

再開時は同じHistory entryを`failed -> applying`へ遷移させ、完了Operation数を保持し、失敗Operation／error code／失敗完了時刻をclearする。`startedAt`は再開attemptの開始時刻へ更新する。過去attemptの詳細監査logはHistory entryへsecretを含み得るmessageを追加せず、将来の構造化event sinkで扱う。

## D-053 Google Sheets Create Model Migration

Google Databaseの最初のwrite sliceは`create_model`だけとし、1 Modelを同名の1 Sheet、FieldをcanonicalなApplication Model順のcolumn、先頭rowをField名のheaderとして表現する。初期row数は1000、column数は`max(Field数, 1)`とする。Index、Relation、validation rule、runtime dataはこのOperationで別resourceへ展開せず、後続Operationのsupportが確定するまでApplication Model定義内の情報として扱う。

1 OperationはSheets `spreadsheets.batchUpdate` 1回にまとめ、決定的な正のSheet IDを指定した`addSheet`、headerの`updateCells`、Sheetに紐付くgstack管理用Developer Metadataの作成を同一request内で行う。管理markerはsecretやcredentialを含めず、format version、Migration checksum、Operation IDを識別できる値だけを持つ。既存markerが同じchecksum／Operationを示す場合は成功済みとしてskipし、同名Sheet、同じSheet ID、競合markerが存在する場合は上書きせずdrift／conflict errorとする。

write requestはresponse喪失後に同じ`addSheet`を安全に自動再送できないため、HTTP層では`retryable: false`とする。429／5xx／network failureはsafe errorとしてHistoryへ記録し、lock取得と最新metadata再読込を伴う明示resumeでmarkerを確認してから続行する。公式上のatomic batch、推奨2 MB以下、write quota 300／分／project・60／分／user／projectを上限として扱うが、MVPは1 spreadsheetにつき直列実行し、1 Operationを1 batchに制限する。quota値をアプリケーション側の並列化許可として解釈しない。

`create_model`をManifestで`native`へ変更する条件は、strict request／response adapter、OAuth `database_write` scope、markerによる再開時idempotency、競合拒否、safe error変換のtestが揃うことである。D-056で別途昇格条件を満たした`add_column`を除き、他Operationは各々のデータ保持・rollback意味論が確定するまで`unsupported`を維持する。

## D-054 Google Migration History Storage and Lock

Google ProviderのMigration Historyはconfigured Drive folder配下のgstack管理JSON fileへversionごとに1件保存する。file名は`.gstack-migration-<version>.json`、MIME typeは`application/json`とし、`appProperties`にformat markerとversionを持たせる。内容はMigration packageのstrictなHistory entryだけで、credential、token、Google error payloadを含めない。検索はfolder parent、trashed=false、gstack markerをすべて指定し、同一versionの重複、folder外file、marker／内容version不一致をconflictとして拒否する。更新は既存file IDへのmedia update、新規作成はconfigured folderをparentとするcreateで行う。

History adapterは`drive.file` scopeを使い、自身が作成した管理fileだけを読み書きする。list response、metadata、JSON bodyをstrictに検証し、unknown fieldを捨てる。History writeはMigration lock内で直列化されるが、response喪失時のcreate重複を避けるため自動retryしない。明示resume時は再検索し、同じversion／checksumの単一fileだけを継続する。

排他lockはSpreadsheet上のdeterministicなNamed Range IDを使う。取得は`addNamedRange`を単独のatomic batchUpdateとして実行し、既存ID errorをlock unavailableへ変換する。rangeはmetadata readで得た最小Sheet IDのA1に固定し、業務cell値を変更しない。解放は同じIDの`deleteNamedRange`とし、取得・解放writeはresponse喪失時の状態が曖昧なため自動retryしない。lock IDはProvider contextとMigration versionから決定的に導出し、表示名にchecksumやsecretを含めない。

Sheets RESTにはcompare-and-set付きlease更新がないため、MVPは期限切れlockの自動stealを禁止する。process異常終了でlockが残った場合は、HistoryとProvider stateをread-only診断した後にだけ、将来の明示`migration unlock`操作で解除する。通常Applyやresumeが既存lockを暗黙削除してはならない。Apps Script LockServiceは実行中script内の排他には使えるが、CLI processの終了後も検査可能なMigration lockの代替とはしない。

## D-055 Migration Apply CLI Approval

CLI Applyは`gstack migration apply --file <path>`でProject Root配下`migrations/`の単一YAML fileを明示指定する。絶対path、`..`、symlinkによるdirectory外参照、暗黙の最新file選択、複数fileの一括適用を禁止する。fileはstrict parserとchecksum検証を通し、Historyの直前applied snapshotから現在のApplication ModelへのDiffを再生成する。Migration FileのOperationはcapabilityを除く全canonical内容が再生成Planと一致しなければならず、一致した場合だけ現在Application Model snapshotをtargetとして使う。これにより古いFileへ新しいSchema snapshotを誤って記録しない。

`--dry-run`はFile、Schema、History、capabilityを検証し、評価済みPlan、Migration checksum、Plan fingerprintを表示するが、approval、lock、History write、Provider writeを行わない。実Applyは同じcommandへ`--approval <64-hex-fingerprint>`を明示し、対話promptや`--yes`による省略をMVPでは提供しない。破壊的Planはさらに`--allow-destructive`、failed Historyの再開は`--resume`を要求する。`--json`でも同じ明示引数を必要とし、environment variableやconfigからapprovalを暗黙取得しない。

Apply前にCLIが再計算したfingerprintと入力approvalを共通Migration preflightが照合する。Plan、File、Schema、Provider capabilityのいずれかが変わればfingerprintも変わり、再度dry-runが必要になる。approval tokenはsecretではないが、History、Schema、Migration Fileへ保存しない。MCPにはApplyを追加しない。

## D-056 Google Sheets Add Column Migration

Google Sheetsの`add_column`は、gstack管理対象Sheetの既存header末尾へ1列を追加する。既存列をApplication Model順へ並べ替えず、既存rowのcell値を変更・削除しない。新規列の既存rowは空値のままとし、`required`、`unique`、型、defaultなどのApplication semanticsをSheetsのvalidation ruleやbackfillとして暗黙実装しない。backfillが必要な変更は別の明示的なdata migration契約が確定するまで扱わない。

実行前に対象SheetのID、title、grid column count、先頭rowのheader、gstack Developer Metadataをreadする。対象Modelと一致する単一の`gstack_model` marker、空文字やgapを含まない一意なheader列を必須とする。追加対象名が既存headerに存在する、Model markerがない、同名／同ID Sheetが競合する、headerが不正、Operation markerがheader位置と一致しない場合はdrift／conflictとしてwrite前に拒否する。

冪等性markerはkeyを`gstack_operation`、valueを`<migration-checksum>:<operation-id>`とし、追加列だけを指す`COLUMNS` DimensionRangeへ保存する。同じmarkerが1件だけ存在し、そのrangeのheaderが追加対象名なら適用済みとしてskipする。markerだけ、headerだけ、重複marker、異なる位置／値は競合とする。

追加位置は現在の連続header数とする。位置がgrid column count未満なら`insertDimension`で既存の未管理列を右へ移動し、位置が末尾なら`appendDimension`でgridを1列拡張する。その後、headerの`updateCells`とDeveloper Metadata作成を同じ`spreadsheets.batchUpdate`へ順番に含める。Google Sheets APIが保証するbatch全体の事前検証とatomic適用を前提とし、response喪失時に安全な再送を判断できないためwrite requestを自動retryしない。明示resumeでは最新状態を再readしてmarkerを照合する。

strict mapper／state parser、header／marker conflict、atomic request、response検証、OAuth `database_write` scope、response喪失後のskipをtestした後にだけ、Google Providerの`add_column` capabilityを`native`へ変更する。`add_column`のrollbackは、追加後の業務dataを削除し得るため、別途明示的なrollback確認とmarker照合契約が確定するまでProviderへ公開しない。

参考: [Google Sheets `spreadsheets.batchUpdate`](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)、[Requests / InsertDimensionRequest](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request)

## D-057 Standard Environment Secret Resolver

公式CLI／MCPの標準Runtimeは、local shellとCIの双方でprocess environmentをSecret sourceとして使用する。`authentication.credentialSecret`はuppercase snake-caseの環境変数名だけを参照し、値はD-041のstrictなauthorized user JSON payloadとする。Project Configへcredential値を置かず、環境変数名だけを保存する。

標準Runtimeは`.env` fileの探索／自動読込、Project内credential file、OS keychain操作、OAuth browser flow、refresh／access token cache、environmentの列挙やlog出力を行わない。localでは利用者のshellまたは外部secret managerがprocess起動時に環境変数を注入し、CIではCI platformのmasked secretから同名環境変数を注入する。missing、空、不正JSON、未知key、保存済みaccess tokenをsafe credential errorとして拒否する。

testおよび埋込みhostは同じ`ProviderSecretResolver` portへ明示的な環境mappingまたは別adapterを注入できる。ただし公式entry pointがsecret storageを推測してfallbackしてはならない。gstackは解決したpayloadと短命access tokenをfilesystem、Config、Schema、Migration、History、generated artifact、通常出力へ永続化しない。

## D-058 Migration Rollback Preview Selection

MVPのRollback previewは`gstack migration rollback --file <path> --dry-run`で単一の適用時Migration Fileを明示指定する。File path、strict parse、checksumの安全規則はD-055 Applyと同じとし、暗黙の最新File選択、複数Migration一括Rollback、MCP Rollbackを提供しない。

選択したFileと同じversion／name／checksum／Operation数を持つHistory entryが存在し、そのentryがHistory全体のlatest attemptかつ`applied`で全Operation完了している場合だけpreviewできる。後続のpending／applying／applied／failed／rolled_back entryが1件でもある場合、依存関係を推測して飛び越えず拒否する。対象以前で最後に`applied`のまま残るentryのApplication Model snapshotをrollback targetとし、存在しない初回Migrationでは`null`を維持する。

Rollback PlannerはD-051に従って完了済みforward Operationを逆順変換し、Provider Manifestでinverse Operationのcapabilityを評価する。`--dry-run`はsource version／checksum、rollback target version、評価済みRollback Plan、risk、destructive、applicability、source Fileと評価済みPlanに結び付くfingerprintを表示するが、approval、lock、History write、Provider writeを行わない。irreversible forward Operation、History不整合、unsupported inverse Operationを隠さない。

実Rollbackは、Providerごとの逆操作、drift照合、追加後に生じた業務dataの破壊確認、rollback専用History実行状態、response喪失時のidempotencyが確定するまで公開しない。previewで生成したfingerprintだけをもってApply Engineへ流用してはならず、将来の実Rollbackには別の明示承認契約を必要とする。

## D-059 Generated Artifact Inventory

Generated Artifact inventoryのSingle Source of TruthはD-026の`generated/.gstack-manifest.json`とする。Core Read APIはManifestの有無と、Manifestが所有するpath／checksumの決定的な配列だけを返す。Artifact本文、filesystem timestamp、size、manual file、credential、Schema／Provider runtime stateを含めない。

Manifestが存在しない場合は`manifestPresent: false`と空配列を正常結果として返す。Generator Configが現在無効でもRead APIのcapabilityは`available`とし、残存Manifestがあれば所有情報を返す。filesystemを走査して未記録fileを追加したり、各Artifact本文を読んでchecksum一致やdriftを暗黙検証したりしない。Manifestが不正、symlink境界に違反、または安全に読めない場合は既存のsafe Generation errorへ変換し、部分的inventoryを返さない。

MCPはCore APIへ委譲する`list_generated_artifacts` read-only Toolと`gstack://generated-artifacts` Resourceを公開する。MCP AdapterがManifestを直接parseしたり、generated directoryを走査したりしてはいけない。Artifact本文取得、drift検証、再生成、削除はこのinventory契約に含めない。

## D-060 Core Logging Contract

MVPのCore Loggingは注入可能な同期`GstackLogSink`とLoggerだけを定義し、global logger、console直接出力、filesystem sink、network sinkをCoreへ持たない。Log Eventは注入clockから得るUTC timestamp、`debug | info | warn | error` level、Core errorと同じcategory、uppercase snake-caseのstable codeだけを持つ。

任意message、error object、stack、path、subject、metadata、context map、Provider response、Schema値、environment、credential、tokenをLog Event入力に含めない。これによりredaction対象を後追い推測せず、secretや利用者dataが構造上混入できない最小契約とする。不正level／category／code、無効clockはeventを破棄する。

Loggingは観測専用であり、clock／sinkのthrowによってDomain操作の成否を変えてはいけない。公式Runtimeのdefaultはno-op Loggerとし、CLI stdoutのmachine-readable envelopeやMCP protocol contentへLog Eventを混在させない。stderr sink、event code catalog、sampling、永続化、相関ID、duration／metricは、安全なfieldとAdapter境界を別途確定してから追加する。

## D-061 Google Apps Script Managed Content Write

Apps Script APIの`projects.updateContent`は指定projectの既存fileを全置換し、requestに含まれないfileを削除する。そのためGoogle Providerの最初のwrite境界は、configurationで指定された既存projectのcontentをreadした後、gstack管理markerが完全一致する場合だけ、strictに検証済みの完全なsource bundleへ置換する操作とする。未管理projectの暗黙採用、既存manual fileのmerge、project作成は行わない。

source bundleは重複しない非空file名、`SERVER_JS | HTML | JSON` type、string sourceを持ち、JSON manifestをちょうど1件とgstack管理markerを含む。markerは`gstack_managed` SERVER_JS fileと固定sourceの組であり、secret、credential、project ID、filesystem pathを含めない。入力とGoogle responseは同じstrict parserを通し、responseの完全なfile集合が要求と一致しなければ成功扱いしない。

ownership確認のcontent GETは`script.projects.readonly` scopeでretry可能とする。全置換PUTは`script.projects` scopeを使い、response喪失時に適用結果を断定できないため自動retryしない。Apps Script APIにはcontent更新用のcompare-and-set／ETag前提を置けないため、readとwriteの間の外部編集を完全には防げない。CLI Deployへ接続する前に、Generator成果物からProvider固有bundleを組み立てる境界、未管理projectを明示採用する初期化手順、preview fingerprint、version／deploymentの再開・冪等性を別途確定する。

参考: [Apps Script API: Manage projects](https://developers.google.com/apps-script/api/how-tos/manage-projects)、[projects.updateContent](https://developers.google.com/apps-script/api/reference/rest/v1/projects/updateContent)

## D-062 Apps Script Project Management Initialization

既存Apps Script projectをgstack管理対象へ採用する初期化は、content readでJSON manifestがちょうど1件だけ存在し、SERVER_JS／HTMLや他fileが一切ない空projectと確認できる場合に限る。空projectの既存manifestをそのまま保持してD-061の管理markerだけを追加する完全置換とし、manifestのtimezone、runtime version、OAuth scope等を推測変更しない。

source file、複数manifest、管理markerを含む既存projectは初期化を拒否する。手書きfileの自動退避、merge、上書き、既存管理projectの再初期化を行わない。readにはreadonly scope、writeにはprojects scopeを個別に使い、初期化PUTもresponse喪失時に自動retryしない。CLIから公開する場合はProject Initializationの明示commandとpreview／approvalを別途必須とし、通常のgenerate、doctor、deployが暗黙初期化してはならない。

## D-063 Apps Script Generated Bundle Boundary

GeneratorはProviderへ依存せず、Apps Script backend producerが所有するdeploy入力を`generated/backend/appsscript/`直下へ出力する。MVPの入力は`appsscript.json` manifestをちょうど1件、1件以上の`.gs` server source、optionalな`.html` sourceとする。flatなlower snake-case file名だけを許可し、subdirectory、未知拡張子、管理用予約名、他Generator成果物との混在を拒否する。

Google Providerはこの明示的な成果物集合をApps Script APIの`JSON | SERVER_JS | HTML` fileへpureに変換し、configured Spreadsheet IDだけを`gstack_config` server fileへJSON string literalとして注入し、D-061の管理markerを追加する。Apps Script project ID、Drive folder ID、credential参照名、credential値、tokenはbundleへ含めない。GeneratorはGoogle Provider configurationを読まず、Google ProviderはApplication ModelやGenerator packageへ依存しない。

bundle変換だけではbuild／deploy成功を意味しない。Generator producer、generated manifestによるchecksum照合、管理projectへのwrite、version作成、deployment公開はそれぞれ別の段階とし、通常Generator成果物やmanual fileを推測してuploadしてはならない。

## D-064 Apps Script Backend Generator and Transport

MVP Generator Configに独立した`backend` booleanを必須追加し、有効時だけ`generated/backend/appsscript/appsscript.json`と`main.gs`をApplication Modelから決定的に生成する。GeneratorはProvider configurationやGoogle Provider packageを参照せず、Spreadsheet IDはD-063のbundle段階で注入する。API公開対象でないModelはruntime definitionへ含めない。

初期Web App manifestは意図しない公開を避けるため`access: MYSELF`、`executeAs: USER_DEPLOYING`とし、V8 runtimeを使う。匿名公開やdomain公開へ暗黙拡張しない。Apps Script Web AppがGET／POST entry pointだけを提供する制約に合わせ、listはGET、createはPOST、update／deleteはPOST parameter `__gstack_method=PATCH|DELETE`による明示overrideとする。通常のAPI contractが示すPATCH／DELETEとのtransport変換は将来のclient adapterが担当する。

runtimeはSchema由来のresource、Model、Primary Key、Field allowlist、operation flagだけを含み、unknown resource／operation／fieldを拒否する。writeはScript Lockで直列化し、configured Spreadsheetのgstack管理SheetだけをModel名で取得し、headerがApplication ModelのField順と完全一致しなければdriftとして拒否する。ResponseはJSONの`ok`と`data | error.code`だけを返し、生error、stack、credential、tokenを返さない。型・required・permissionの完全な実行時検証、HTTP status表現、認証role mappingはDeploy公開範囲を広げる前に追加する。

## D-065 Google Deploy Build Preview

`gstack deploy --dry-run`は現在のApplication ModelとGenerator Configからmemory上でGeneration Planを再生成し、D-063のbackend pathだけをGoogle source bundleへ変換する。filesystemへ生成物を書かず、Google API、Secret Resolver、OAuth gatewayを呼ばない。通常のGenerated Artifactやmanual fileをupload対象へ推測追加しない。

previewはProvider名、target Apps Script project ID、file名／type／source checksumの決定的な配列、targetと完全なbundleに結び付くSHA-256 fingerprintだけを返し、source本文、Spreadsheet ID、Drive folder ID、credential参照名、credential、tokenを出力しない。同じSchema、Config、Generatorから同じfingerprintを作り、source、runtime injection、target projectのいずれかが変わればfingerprintを変える。

fingerprintは将来の明示Deploy approvalに使用する候補であり、この段階ではwrite権限を与えない。`gstack deploy`の非dry-runは、管理projectのstate照合、version／deploymentの冪等性、明示approvalが実装されるまで`DEPLOY_DRY_RUN_REQUIRED`で拒否する。MCPへDeployを追加しない。

## D-066 Apps Script Version and Deployment Idempotency

Apps Script content書き込み後のreleaseは、D-065 fingerprintを`gstack:<64-hex>` descriptionに持つimmutable versionと、固定description `gstack-managed`を持つ単一deploymentで表現する。version作成前に全pageをlistし、同じdescriptionが1件なら再利用、0件なら作成、複数なら競合として拒否する。deploymentも全pageをlistし、管理対象が0件なら作成、1件ならversion差分時だけ更新、複数なら競合として拒否する。管理対象でないdeploymentを変更・削除しない。

versionのlist／createは`script.projects` scope、deploymentのlist／create／updateは`script.deployments` scopeを操作ごとに使用する。list GETだけをretry可能とし、version POST、deployment POST／PUTはresponse喪失時の重複・状態不明を避けるため自動retryしない。明示的なDeploy再実行は再listによって同一descriptionのversion／deploymentを回復する。

list adapterは`nextPageToken`を最後まで辿り、token重複、100 page超過、不正responseを拒否する。deployment responseは正のversion number、非空deployment ID、管理description、単一のWEB_APP entry pointと非空URLを必須とする。結果は`created | updated | unchanged`、version number、deployment ID、Web App URLだけを返し、OAuth response、credential、token、生errorを含めない。source uploadとこのpublish serviceの順序・approval接続はRuntime契約で一体化する。

参考: [projects.versions](https://developers.google.com/apps-script/api/reference/rest/v1/projects.versions)、[projects.deployments.list](https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments/list)、[projects.deployments.update](https://developers.google.com/apps-script/api/reference/rest/v1/projects.deployments/update)

## D-067 Explicit Google Deploy Execution

実Deployは`gstack deploy --approval <fingerprint>`だけで開始し、同command内でD-065 buildを再生成してapprovalと完全一致することをProvider write前に検証する。dry-runとapprovalの同時指定、approval省略、古い／別targetのfingerprintを拒否する。approvalはConfig、Schema、generated manifest、Apps Script content、version descriptionへ保存せず、version識別には承認対象であるfingerprintだけを使う。

実行順は、管理markerを再確認したApps Script content全置換、fingerprint versionの解決／作成、単一`gstack-managed` deploymentの解決／作成／更新とする。未管理projectをdeployが暗黙初期化せず、content更新失敗後にversionを作らない。content更新後のversion／deployment失敗は自動rollbackせず、同じSchema／Configの明示再実行でD-061とD-066のstate再照合から回復する。

成功結果はfingerprint、`created | updated | unchanged` outcome、version number、deployment ID、Web App URLだけを返す。source本文、Spreadsheet ID、credential参照名、credential、access／refresh token、生Google errorを含めない。MCPには実Deployを公開しない。Deploy前のMigration適用済み状態確認、runtimeの完全な型／permission検証、Project Initialization CLIはFirst Deploy完了前の独立gateとして残す。

## D-068 Deploy Migration Readiness Gate

実Deployはapproval一致後かつApps Script content更新前に、Google Migration Historyのlatest attemptをreadする。latestが`applied`、全Operation完了、applied Application Model snapshot checksumが現在Schemaから再構築したsnapshot checksumと完全一致する場合だけ続行する。Historyが空、latestがpending／applying／failed／rolled_back、snapshot欠落／不一致、Schemaが不正な場合は`DEPLOY_MIGRATION_NOT_READY`で拒否する。

gateはHistoryのstatusとsnapshotだけを参照し、Provider resource introspectionから適用済み状態を推測しない。Deploy dry-runはD-065どおり外部接続しないためMigration readinessを成功扱いせず、実Deploy時の独立preconditionとする。History read失敗時にcontent更新へ進まず、DeployがMigration ApplyやRollbackを暗黙実行しない。

## D-069 Apps Script Management Initialization Approval

Apps Script管理初期化は`gstack provider initialize google --dry-run`で、configured Script IDのcontentをreadし、D-062のbase manifest 1件だけであることを検証する。previewはScript ID、manifest sourceのSHA-256 checksum、operation／target／manifest checksumに結び付くfingerprintだけを返し、manifest本文、credential、tokenを出力しない。readにはreadonly projects scopeだけを使う。

実初期化は同commandの`--approval <fingerprint>`を必須とし、最新contentを再readしてfingerprintを再計算し、一致した場合だけ既存manifestを保持して管理markerを追加する。dry-runとapprovalの同時指定、approval省略、content変更後の古いapproval、source／HTMLがあるproject、既に管理済みのprojectをwrite前に拒否する。初期化PUTはD-061どおり非retryとし、Deploy、generate、doctorがこの操作を暗黙実行しない。

## D-070 Apps Script Runtime Field Validation

Apps Script backend definitionは各公開ModelについてField名、type、required、unique、enum values、minLength／maxLength／pattern／min／maxをApplication Modelから決定的に埋め込む。createはrequired Fieldの存在、create／updateはunknown Field拒否と指定値の全ruleをSheets write前に検証する。Primary Keyはupdate pathと同値の場合以外変更を拒否する。

型mappingはstring／textをstring、uuidを標準hyphen形式、integerをsafe integer、numberをfinite number、booleanをboolean、dateを`YYYY-MM-DD`の有効日、datetimeをparse可能なstring、enumを定義値、jsonをJSON requestで表現可能な値とする。string／number validationを該当型にだけ適用する。unique FieldはScript Lock内で既存rowを検査し、createでは全row、updateでは対象row以外との重複を拒否する。optionalなnull／空値は複数rowで許可する。

検証失敗はsafeな`REQUEST_INVALID`、重複も内部詳細を公開せず同じsafe errorへ変換する。Schema permission roleとApps Script利用者identityの対応は未確定のため推測せず、Web App accessは引き続き`MYSELF`に限定する。role enforcementが確定するまでPublish accessを拡張しない。

## D-071 Build CLI Contract

`gstack build --dry-run`はApplication ModelとGenerator ConfigからGeneration Planをmemory上で作り、D-063 Google source bundleへの変換とD-065 Deploy fingerprint生成まで検証する。filesystem、Provider、Secret Resolverを変更・呼出しせず、artifact path／checksum、stale delete path、sourceを含まないDeploy previewだけを返す。

`gstack build`は同じGeneration PlanをGenerator Writerで`generated/`所有領域だけへ反映した後、その同一Planからbundleとfingerprintを検証する。manual領域、Provider content、Migration、deploymentを変更しない。Build結果はdry-run flag、artifact path／checksum、delete path、Deploy previewを持ち、artifact本文、credential、tokenをCLI JSONへ含めない。同じ入力のdry-runとwriteで同じDeploy fingerprintを返す。

`generate`はProvider非依存の全生成物作成、`build`は生成物作成と標準Google Deploy bundleの成立確認、`deploy`はapproval付きProvider公開を担当する。BuildがProject Initialization、Migration Apply、Deployを暗黙実行してはいけない。

## D-072 Local Development Server

`gstack dev`は有効なApplication Modelからloopback `127.0.0.1`専用のNode HTTP serverを起動し、公開API Modelをin-memory storeで実行する。既定portは3000、明示portは1〜65535とし、外部interface bind、Google Provider、credential、Migration History、generated／manual filesystemへ接続・書込しない。process終了で全dataを破棄し、本番dataやMigration stateの代替にしない。

local transportはAPI contractどおりcollection GET／POST、item PATCH／DELETEを使用し、JSON request最大1 MiB、no-store JSON response、Schema由来のtype／required／enum／validation／unique／Primary Key不変を適用する。unknown resourceは404、invalid requestは400、unique conflictは409、無効operationは405のsafe codeを返し、生errorやstackを返さない。

server lifecycleはRuntimeが開始／closeを所有し、CLIはURL表示とSIGINT／SIGTERMによるgraceful closeだけを担当する。UI bundling、hot reload、persistent fixture、Provider emulator、permission role simulationはこの初期Local Development sliceに含めず、対応したように表示しない。

## D-073 Plugin Manifest, Registry, and Loader

共通`@gstack/plugin` packageはCoreへ具体Pluginを持ち込まず、`provider | generator` kindのPlugin contractだけを所有する。Plugin Manifestは`formatVersion: 1`、stable ID、kind、npm package name、Plugin version、minimum gstack versionを必須とし、未知key、path／URL package、invalid semverを拒否する。互換性はSemVer coreとprerelease順序を含め、実行gstack versionがminimum以上の場合だけ認める。

Plugin Registryはmemory上でIDとpackage nameの双方を一意に登録し、ID順で決定的に列挙する。Provider Pluginは共通Manifestと既存Provider Manifestのname／package／version／minimum version完全一致を必須とし、既存Provider RegistryへFactoryだけを橋渡しする。Generator PluginはApplication ModelとPlugin固有のJSON-compatible configurationだけを受け、Provider、filesystem、Runtimeを入力にしない。

Plugin Loaderは呼出側が明示したnpm package specifierだけを注入可能Importerでdynamic importし、moduleのnamed export `gstackPlugin`、package identity、version互換性、definitionを検証してからRegistryへ登録する。relative／absolute path、URL、重複specifier、filesystem探索、node_modules scan、package install、credential解決を行わない。load／validation errorはpackage内部や生import errorを通常結果へ含めない。

Generator Plugin成果物は`generated/plugins/<plugin-id>/`配下だけを許可し、共通Artifact path／checksum／重複検証を通す。他Plugin、built-in generated、manual領域へ出力できない。Plugin configurationのProject Config永続形式、公式Runtimeへの明示package allowlist接続、CLI install／removeは別契約で追加する。

## D-074 Plugin Project Configuration

`gstack.yaml`のoptional `plugins` sectionは必須子key `packages`と`configuration`だけを持つ。`packages`は利用者が明示した重複なしnpm package name sequenceで、relative／absolute path、URL、空値を拒否する。section未指定は空allowlistと空configurationへ正規化し、filesystemやdependenciesからpackageを自動発見しない。

`configuration`はPlugin IDをkey、JSON-compatible mappingを値とし、credential値やtokenを置く場所として扱わない。Config Loaderは構文、package name、ID、JSON互換性だけを検証・freezeし、package import、Manifest解釈、Plugin実行を行わない。packageとPlugin IDの対応、未使用configuration、互換性はPlugin Loader／Runtime接続時に検証する。

## D-075 Standard Runtime Provider Plugin Loading

標準RuntimeはProject Config読込後、D-074の明示package allowlistだけをD-073 Plugin Loaderへ渡し、互換性検証済みProvider PluginのFactoryを既存Provider Registryへ登録する。公式Google Providerも同じRegistryへcomposition rootで登録し、Projectのenabled Provider名が最終Registryに存在しない場合はProject loadを拒否する。

Runtime optionはtest／埋込みhost向けにImporter portを注入できるが、Config、Core、CLIがimportを直接行わない。Provider Pluginのconfiguration／Secret Resolverは既存Provider Runtime contractを再利用し、Plugin Loaderへcredentialを渡さない。Generator PluginのGeneration Plan統合はArtifact Manifestとの単一Plan合成を確定してから別途接続する。

## D-076 Standard Runtime Generator Plugin Integration

標準Runtimeは互換性検証済みGenerator PluginをApplication ModelとPlugin IDごとのconfigurationで実行し、その成果物をbuilt-in producerの成果物と合わせて1つのGeneration Planへ渡す。CoreはPlugin Manifest／Registry／Loaderへ依存せず、Application Modelから追加Artifactを返す注入portだけを持つ。Plugin実行とconfiguration解決はcomposition rootであるRuntimeが所有する。

全成果物は共通のpath正規化、checksum、重複検出を通り、単一Generated Artifact Manifest、stale削除、atomic Writerを共有する。Generator Pluginは`generated/plugins/<plugin-id>/`外へ出力できず、built-inや他Pluginの成果物を上書きできない。allowlistでloadされていないPlugin ID向けconfigurationはProject load時に拒否し、Plugin失敗時はPlan作成を中止してfilesystemへ書き込まない。

Google Deploy bundleはD-063のbuilt-in Apps Script pathだけを入力とし、Plugin成果物を暗黙にProvider sourceへ混入させない。Pluginのinstall／remove、情報表示、配布package検証は別契約で扱う。
