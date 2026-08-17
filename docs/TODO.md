# gstack TODO

> ドキュメント一覧: [`../README.md`](../README.md)

このファイルは、現在のdraft仕様から安全に推測できない必須作業を管理します。各項目を実装で利用する前に、正式な設計ドキュメントで解決してください。

## Core基盤の設計判断

- [x] MVP Schema grammarを確定する（`DECISIONS.md` D-003）。
- [x] Schema DSLのversioningと互換性を定義する（`DECISIONS.md` D-002）。
- [x] MVPのAST／IR表現を定義する（`DECISIONS.md` D-004）。
- [x] 最小`gstack.yaml`契約を定義する（`DECISIONS.md` D-001）。
- [x] Validationの責務とlevelを定義する（`DECISIONS.md` D-005）。
- [x] Application Modelの境界を定義する（`DECISIONS.md` D-006）。
- [x] package公開／versioning方針を定義する（`DECISIONS.md` D-014）。

## 後続Milestoneの設計判断

- [x] Generator inputを統一する（`DECISIONS.md` D-009）。
- [x] Generated／Manual codeの所有権を定義する（`DECISIONS.md` D-010）。
- [x] Migration baselineと構造化planを定義する（`DECISIONS.md` D-007、D-008）。
- [x] Core／Provider分離を明確化する（`DECISIONS.md` D-011）。
- [x] Provider capabilityの粒度を定義する（`DECISIONS.md` D-012）。
- [x] machine-readable envelopeを定義する（`DECISIONS.md` D-013）。
- [x] Google Providerの初期configuration／Gateway境界を定義する（`DECISIONS.md` D-039）。
- [x] Project Provider ConfigurationのProvider非依存契約を定義する（`DECISIONS.md` D-048）。
- [x] Google認証方式とoperation別最小scopeは`DECISIONS.md` D-039、credential payload／refresh境界はD-041、local／CI共通のEnvironment Secret ResolverはD-057で確定・実装済み。credential値やtokenをProject Configへ保存しない。
- [x] Google Sheets metadata read、HTTP retry、Migration Operation mappingと全MVP write Operationのデータ保持／idempotency契約をD-040／D-042／D-050／D-053／D-056／D-082からD-087で確定し、各adapterを実装した。Rollback実行は独立した明示契約まで公開しない。
- [x] D-085に従い、Google Sheets `alter_column`の全row互換性検査、値を露出しないdiagnostic、column markerによるresume、標準Runtime接続を実装し、Manifestを`emulated`へ変更した。
- [x] D-086に従い、Google Sheets Index marker、複合unique既存data検査、生成Apps Script runtimeのtuple一意性保証を実装し、`add_index`／`drop_index`を`emulated`へ変更した。
- [x] D-087に従い、Google Sheets Relation marker、既存参照検査、生成Apps Script runtimeの参照先確認／RESTRICT deleteを実装し、`add_relation`／`drop_relation`を`emulated`へ変更した。
- [x] D-089に従い、Google Provider Configのrole binding、Apps Script `USER_ACCESSING` identity、全CRUDのfail-closed permission検証、binding本文をpreview／結果へ出さないDeploy bundleを実装した。`MYSELF`以外の公開範囲は拡張しない。
- [x] Google Migration History Storage／LockはD-054で確定し、Drive管理JSON adapterとSheets Named Range lock adapterを実装した。明示unlockは診断契約を別途確定してから公開する。
- [x] D-091に従い、中断Historyの回復、read-only lock診断、fingerprint承認付き`migration unlock`、解除失敗の再試行を実装した。
- [x] Migration Apply CLIのfile選択、Schema一致、approval UXはD-055で確定。安全なfilesystem loader、`--dry-run`、同じ準備結果を使う明示承認付き実Applyを実装した。
- [x] D-090に従い、Google ProviderのRollback実行、専用History状態、fingerprint／destructive承認、失敗後の明示resumeを実装した。

## MCP／AI supportの後続作業

- [x] 対応サブシステムの実装に合わせてCore Read APIを拡張した。Application Model、Migration status／history／plan、Generation Plan preview、Provider capability／health、Google Migration History Storage、D-059のGenerated Artifact inventoryを提供する。
- [x] 対応するCore Read APIへ委譲するMCP Resource／Toolを追加した。Application Model、Migration status／history、Generation Plan preview、Provider Catalog／inspection、Generated Artifact inventoryをread-onlyで提供する。
- [x] Generator設計で生成領域向け`AGENTS.md`と永続化する`PROJECT_CONTEXT.md`の形式を定義し、Application Modelから導出する（`DECISIONS.md` D-031）。現在のCore／MCP Project Contextはmemory上のread modelであり、生成物ではない。
- [x] Codex、Claude Code、その他stdio MCP host向けのsource checkout installation例を公式資料に合わせて文書化した（`DECISIONS.md` D-081）。npm公開後の例は実配布時に追加する。
- [ ] 危険なMCP Toolは、明示的な確認、plan-before-apply、破壊操作承認を含む別設計が確定した場合にだけ追加する。現時点で承認済みの危険なToolはない。

## Migration Engine実装前の設計判断

- [x] MVP Operation範囲を統一する（`DECISIONS.md` D-015）。
- [x] stable Operation IDのcanonical生成規則を決める（`DECISIONS.md` D-016）。
- [x] `alter_column`のproperty、risk、reversible判定を確定する（`DECISIONS.md` D-017）。
- [x] 初回Migrationのbaseline表現を確定する（`DECISIONS.md` D-018）。
- [x] explicit rename intentの形式と検証規則を確定する（`DECISIONS.md` D-019）。
- [x] capability resultの付与段階を確定する（`DECISIONS.md` D-020）。
- [x] Primary Key変更の扱いを確定する。MVPでは禁止し、専用errorを返す（`DECISIONS.md` D-021）。
- [x] Rollback Planのcanonical順序、初回Migrationのrollback target、Migration Fileへrollback Operationを保持するかを確定する（`DECISIONS.md` D-051）。
- [x] Migration Lock、部分失敗からの再開、Apply承認／destructive確認の契約を確定する（`DECISIONS.md` D-052）。具体Providerのidempotencyが未実装のためApply自体はまだ有効化しない。

## Generator Engine実装前の設計判断

- [x] Generated Artifact Manifestのversion、checksum、path正規化、stale artifact削除手順を確定する（`DECISIONS.md` D-026）。
- [ ] MVP Generator Configと生成対象の有効化単位を確定する。built-in producerと`gstack.yaml`接続は`DECISIONS.md` D-001／D-032で完了。標準Templateの選択・override規則はAPI／UI Generator着手前に確定する。
- [x] TypeScriptのModel／Field命名規則と型mappingを確定する（`DECISIONS.md` D-027）。
- [ ] API Generatorのruntime transport、routing framework、Template契約を確定する。framework非依存contractとhandler／business logic境界は`DECISIONS.md` D-034で完了。特定frameworkを暗黙選択しない。
- [x] UI Generatorのframework、標準Template、List／Form component境界、styling方針を確定する（`DECISIONS.md` D-035）。Detail／Search／Filter／PaginationはSchema契約がないため将来対応とする。

## Core Foundationの残判断

- [x] Logging contractを`DECISIONS.md` D-060で確定し、任意message／metadataを持たない最小Event、注入可能Sink／clock、no-op既定、secret-safeなCLI／MCP境界をCoreへ実装した。
- [x] Apps Scriptの全置換特性を`DECISIONS.md` D-061で確定し、管理marker、strict source bundle、read-before-write、非retry PUTをGoogle Providerへ実装した。
- [x] Generator成果物からGoogle Provider固有Apps Script source bundleへ変換する責務とpath規則を`DECISIONS.md` D-063で確定し、strictなpure変換をGoogle Providerへ実装した。
- [x] Application Modelから`generated/backend/appsscript/`へprivate Web App用CRUD sourceを生成するProvider非依存producerとtransport規則を`DECISIONS.md` D-064で確定・実装した。
- [x] 空の未管理Apps Script projectだけを管理marker付きへ明示採用するProvider初期化境界を`DECISIONS.md` D-062で確定した。
- [x] Apps Script project初期化のread-only preview、状態fingerprint、明示approval付きCLIを`DECISIONS.md` D-069で実装した。
- [x] Apps Script version／deploymentのfingerprint、再listによる再開、単一管理deployment、pagination、公開URLのsafe resultを`DECISIONS.md` D-066で確定しProvider adapterを実装した。
- [x] Google Deploy buildの無副作用previewとtarget／bundle fingerprintを`DECISIONS.md` D-065で確定し、Runtimeと`gstack deploy --dry-run`へ実装した。
- [x] fingerprintの再計算と明示approval、管理content全置換、version／deployment公開を`DECISIONS.md` D-067でRuntimeとCLIへ接続した。
- [x] Deploy前に最新Historyがappliedかつ現在Application Model snapshotと一致することを確認するgateを`DECISIONS.md` D-068で実装した。
- [x] Apps Script runtimeへField型、required、enum、validation、unique、Primary Key不変の実行時検証を`DECISIONS.md` D-070で追加した。
- [x] Schema permission roleとApps Scriptアクセスidentityの対応をD-089で確定し、role enforcementを実装した。Publish access拡張はD-089の対象外であり、`MYSELF`を維持する。
- [x] generated writeとGoogle Deploy bundle検証を分離するBuild CLI契約を`DECISIONS.md` D-071で実装した。
- [x] loopback限定in-memory APIによる初期Local Development serverと`gstack dev`を`DECISIONS.md` D-072で実装した。
- [x] Provider／Generator共通Plugin Manifest、Registry、明示package Loader、Generator namespaceを`DECISIONS.md` D-073で実装した。
- [x] Plugin package allowlistとPlugin固有configurationのProject Config永続形式を`DECISIONS.md` D-074で確定・実装した。
- [x] 標準Runtimeでallowlist packageをloadしProvider Pluginを既存Provider Registryへ接続した（`DECISIONS.md` D-075）。
- [x] Generator Plugin成果物をbuilt-in成果物と単一Generation Plan／Manifestへ合成した（`DECISIONS.md` D-076）。
- [x] 検証済みPlugin Manifestをconfiguration本文なしで表示するread-onlyな`plugin list`を追加した（`DECISIONS.md` D-077）。
- [x] Plugin install／removeのexact version、lifecycle script無効、state fingerprintを持つread-only Planを実装した（`DECISIONS.md` D-078）。
- [x] Plugin install／removeの実変更をfingerprint再検証、npm失敗時の安全側状態、Manifest検証後のatomic Config更新付きで実装した（`DECISIONS.md` D-079）。
- [x] Plugin配布packageの公開前検証契約とread-only commandを実装した（`DECISIONS.md` D-080）。

## Stable Release

- [x] Pull Requestと`main` pushでNode.js 24、`npm ci`、`npm run check`を実行するGitHub Actions CIを追加した。
- [x] D-092に従い、`gstack init <name>`でProvider credentialを含まない最小projectを安全に生成した。
- [x] D-093に従い、`gstack schema init <model>`で最小Schemaをatomicかつ非上書きで生成した。
- [ ] sample projectでinitからvalidate、migration、generate、deploy dry-runまでのend-to-end contractを検証する。
- [ ] D-014の公開候補packageについてmetadata、収録file、内部依存version、CLI／MCP binを検証するrelease gateを追加する。
- [ ] 1.0公開API／CLI互換性baselineと変更検出方針を確定する。
