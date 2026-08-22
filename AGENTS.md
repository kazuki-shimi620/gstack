# gstack Agent開発ルール

このリポジトリは、CLI First・AI First・Schema Firstなアプリケーションフレームワークgstackを実装します。以下のルールは、このリポジトリに対するすべての変更へ適用されます。

## 変更前に読むもの

- 設計・実装を始める前に、まず`README.md`を読み、次に変更に関連するドキュメントを読んでください。必ず`docs/ARCHITECTURE.md`から始め、その後`docs/`配下の該当仕様を確認します。
- `docs/ARCHITECTURE.md`と`docs/DEVELOPER.md`のArchitecture Invariantsは必須制約です。依頼内容が不変条件と矛盾する場合は、暗黙にアーキテクチャを変更せず、作業を止めて矛盾を報告してください。
- `docs/DECISIONS.md`の確定済み判断は規範です。暗黙に再検討・迂回せず、変更が必要な場合は置き換える判断を明示的に提案し、記録してください。
- Schemaをアプリケーションのdesired stateに関するSingle Source of Truthとして扱います。Config、Migration、生成物、Provider stateを競合するアプリケーション定義にしてはいけません。

## 責務境界を守る

- compiler pipelineを`source loading -> YAML parsing -> AST/IR -> semantic analysis -> normalized Application Model`として明示的に保ちます。Parser、AST/IR、Semantic Analyzer、Application Modelの責務を混在させてはいけません。
- Parserは構文とsource表現だけを扱います。Relation解決、semantic default、ドメイン上の意味検証、Provider accessを行ってはいけません。
- Semantic Analyzerだけがnode間の意味を検証し、正規化されたApplication Modelを生成します。確定済み判断に例外がない限り、下流Engineはraw YAMLやProvider固有データではなくApplication Modelを利用します。
- CoreはProvider contractやregistry abstractionへ依存できますが、具体的なProvider実装へ直接依存してはいけません。Google固有のコード、型、設定、用語、API前提をCoreへ入れてはいけません。
- Migration EngineはProvider非依存のOperationを生成・処理します。SQL、Google Sheets操作などのProvider固有処理を書いてはいけません。破壊的Migrationは暗黙実行せず、review済みplanと明示的な承認を必須とします。
- GeneratorはProvider、live database、runtime stateへ依存してはいけません。Generated CodeとManual Codeを分離し、Generatorが所有する生成先以外を上書きしてはいけません。
- ProviderはProvider contractと外部serviceの処理を実装します。Schema解析、CLI引数解析、Application Model再定義を行ってはいけません。
- CLIはApplication／Core serviceのadapterです。Google API、Provider実装、外部serviceを直接呼び出してはいけません。
- Core APIはhuman-readableな表示ではなく構造化データを返します。CLI、MCP、将来のadapterは同じAPIを再利用し、解析、Validation、Migration、生成、Provider logicを再実装してはいけません。
- MCPは薄いadapter packageです。既定のsurfaceはRead／Validate専用とし、安全設計が確定するまでApply、Rollback、Deploy、Remove、Deleteを公開してはいけません。
- 想定内の失敗はpackage境界で安定したCore errorへ変換します。CLIとMCPの通常のmachine-readable outputへsecret、library生error、内部cause、stack traceを露出してはいけません。

## Securityと安全性

- SecretやCredentialをsource code、Schema、Migration、generated code、fixture、snapshot、logへ保存してはいけません。環境変数またはProvider管理のsecret storageを使い、テストには明らかなfake値を使用します。
- Schema diffだけからrenameを推測したり、破壊的操作を承認したりしてはいけません。plan-before-apply、dry-run、risk classification、明示的な破壊操作承認を維持します。
- 適用済みMigrationを編集してはいけません。checksumとmigration historyを維持します。

## 変更設計と品質

- 新機能では、`Schema -> Application Model -> Core / Generator / Provider -> CLI`の順で責務を検討します。明示的な操作が必要な場合にだけCLI commandを追加します。
- 挙動、契約、依存関係、公開CLI／Schema semanticsを変更した場合は、対応する設計ドキュメントも更新します。未解決の設計判断は推測せず記録してください。
- 利用者向けの機能・互換性・安全要件を変更した場合は、`docs/CHANGELOG.md`の`Unreleased`も簡潔に更新します。未確定versionやRelease日を推測してはいけません。
- packageを凝集させ、依存方向を可視化し、小さなinterfaceを通してcomponentを交換可能に保ちます。Parsing、Analysis、Orchestration、Provider adapterを個別にテストできるよう、pure functionと注入可能なI/Oを優先します。
- TypeScript Strict Modeを使用します。実装上の問題を回避するためにstrictnessを全体で弱めてはいけません。限定的な例外が必要なら、コードの近くに理由を書きます。
- 挙動変更には相応のunit testを追加し、package間連携にはboundary／integration test、利用者向け挙動にはCLI contract testを追加します。テストは決定的にし、明示的なProvider integration test以外ではlive credentialを要求してはいけません。
- 設計ドキュメントが明示的に要求しない限り、generated outputやbuild outputをsource controlへ含めてはいけません。

## 詳細仕様への案内

- `README.md`: ドキュメント入口と現在の実装状況
- `docs/ARCHITECTURE.md`: システム構造、依存ルール、不変条件
- `docs/REQUIREMENTS.md`: 機能要件・非機能要件
- `docs/CLI.md`: 公開CLI契約とexit code
- `docs/SCHEMA.md`: DSL構造とValidation方針
- `docs/MIGRATION.md`: 計画、安全性、履歴、抽象Operation
- `docs/GENERATOR.md`: 生成物の所有権と生成ルール
- `docs/PROVIDER.md`: Provider contract、capability、分離規則
- `docs/DEVELOPER.md`: 内部module、data flow、test、coding rule
- `docs/ROADMAP.md`: 実装順序とmilestone scope
- `docs/PLAN.md`: 現在の実装Phaseと順序
- `docs/MCP.md`: Core API境界、MCP Tool／Resource、Transport、安全方針
- `docs/TODO.md`: 残作業と将来対応
- `docs/DECISIONS.md`: MVPで確定済みの契約と横断的な設計判断
- `docs/RELEASE.md`: Package公開前Gate、公開順序、停止条件
- `docs/CHANGELOG.md`: 未公開・公開済みの利用者向け変更履歴
