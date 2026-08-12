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

- [ ] 対応サブシステムの実装に合わせてCore Read APIを拡張する。Application Modelは完了。Provider capability／health、Migration status／plan、generated artifact inventoryが残っている。
- [ ] 対応するCore Read APIが存在してからMCP Resourceを追加する。Application Modelは完了。Provider、Migration、generated artifactが残っている。
- [ ] Generator設計で生成project向け`AGENTS.md`と永続化する`PROJECT_CONTEXT.md`の形式を定義し、Config／Schema／Application Modelから導出する。現在のCore／MCP Project Contextはmemory上のread modelであり、生成物ではない。
- [ ] package配布commandが安定してから、Codex、Claude、その他MCP host向けのinstallation例を文書化する。
- [ ] 危険なMCP Toolは、明示的な確認、plan-before-apply、破壊操作承認を含む別設計が確定した場合にだけ追加する。現時点で承認済みの危険なToolはない。

## Migration Engine実装前の設計判断

- [ ] MVP Operation範囲を統一する。`MIGRATION.md`第9章はIndex／Relationを含むが、第39章はModel／Column Operationだけを列挙している。
- [ ] stable Operation IDのcanonical生成規則を決める。順序変更でもIDが変わらず、同一plan内で一意になる必要がある。
- [ ] `alter_column`で扱うpropertyと、propertyごとの`safe | caution | destructive`、reversible判定を確定する。
- [ ] 初回Migrationで「last applied snapshotが存在しない」状態をどう表現し、空Application Modelとの差をどう扱うか決める。
- [ ] explicit rename intentの入力形式と、`drop_column`＋`add_column`を`rename_column`へ置き換える検証規則を決める。
- [ ] capability resultをProvider interface導入前のpure planへ含めるか、Provider capability check段階で付加するか決める。

## Core Foundationの残判断

- [ ] Logging contractを確定する。現在はlevelだけが定義されており、event構造、sink、secret redaction、CLI／MCPとの境界が未定義である。契約確定前にloggerをCoreへ導入しない。
