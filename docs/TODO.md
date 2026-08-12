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

## MCP／AI supportの後続作業

- [ ] 対応サブシステムの実装に合わせてCore Read APIを拡張する。Application Modelと注入可能なMigration status／history／planは完了。Provider capability／health、Migration History Storageの具体実装、generated artifact inventoryが残っている。
- [ ] 対応するCore Read APIが存在してからMCP Resourceを追加する。Application ModelとMigration status／historyは完了。Providerとgenerated artifactが残っている。
- [ ] Generator設計で生成project向け`AGENTS.md`と永続化する`PROJECT_CONTEXT.md`の形式を定義し、Config／Schema／Application Modelから導出する。現在のCore／MCP Project Contextはmemory上のread modelであり、生成物ではない。
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

## Core Foundationの残判断

- [ ] Logging contractを確定する。現在はlevelだけが定義されており、event構造、sink、secret redaction、CLI／MCPとの境界が未定義である。契約確定前にloggerをCoreへ導入しない。
