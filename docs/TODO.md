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
- [ ] Google Sheets metadata read、HTTP retry、Migration Operation mapping、`create_model`／`add_column` write契約はD-040／D-042／D-050／D-053／D-056で確定し、両adapterを実装済み。残りのwrite Operationごとにデータ保持、rollback、idempotencyを確定する。
- [x] Google Migration History Storage／LockはD-054で確定し、Drive管理JSON adapterとSheets Named Range lock adapterを実装した。明示unlockは診断契約を別途確定してから公開する。
- [x] Migration Apply CLIのfile選択、Schema一致、approval UXはD-055で確定。安全なfilesystem loader、`--dry-run`、同じ準備結果を使う明示承認付き実Applyを実装した。

## MCP／AI supportの後続作業

- [x] 対応サブシステムの実装に合わせてCore Read APIを拡張した。Application Model、Migration status／history／plan、Generation Plan preview、Provider capability／health、Google Migration History Storage、D-059のGenerated Artifact inventoryを提供する。
- [x] 対応するCore Read APIへ委譲するMCP Resource／Toolを追加した。Application Model、Migration status／history、Generation Plan preview、Provider Catalog／inspection、Generated Artifact inventoryをread-onlyで提供する。
- [x] Generator設計で生成領域向け`AGENTS.md`と永続化する`PROJECT_CONTEXT.md`の形式を定義し、Application Modelから導出する（`DECISIONS.md` D-031）。現在のCore／MCP Project Contextはmemory上のread modelであり、生成物ではない。
- [ ] package配布commandが安定してから、Codex、Claude、その他MCP host向けのinstallation例を文書化する。
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
- [ ] Apps Script project初期化のpreview／approval付きCLI commandを設計・実装する。
- [ ] Apps Script version／deploymentのpreview fingerprint、再開、冪等性、公開URLの安全な出力契約を確定する。
