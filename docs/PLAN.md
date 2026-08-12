# gstack初期実装計画

> ドキュメント一覧: [`../README.md`](../README.md)

> Scope: Core FoundationからSchema Validation、および初期のRead専用Core API／MCP integrationまで。Google Provider、Migration Apply、Generator実装、React、Deploy、Authentication、Plugin loadingは明示的に対象外とする。

## 1. 設計Baseline

gstackはcompiler／build system型のframeworkである。YAML Schemaでdesired application stateを宣言し、Provider非依存のpipelineでcompileする。

```text
gstack.yaml -> Config Loader
schema/*.yaml -> Schema Loader -> YAML Parser -> AST/IR
                                            -> Semantic Analyzer
                                            -> Application Model
                                            -> Schema Validation result
CLI / MCP -> Core orchestration -------------------------------^
```

raw Schema構文をEngineの入力にしてはいけない。正規化されたApplication Modelを、後続のMigration、Generator、ドキュメント、Provider Validationの境界とする。この解釈はArchitecture Invariantsに従う。

## 2. 技術選定

| 領域            | 選定                                                                   | 理由                                                                                                                 |
| --------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Runtime         | Node.js 24 LTS、ESM                                                    | support対象のproduction LTSと標準Node module semanticsを使う。CIとreleaseでは最新のNode 24 patchを固定する。         |
| 言語            | TypeScript、`strict: true`、追加の安全なindex／optional property check | `DEVELOPER.md`の必須要件。compiler境界でunknown／optional dataを正確に扱える。                                       |
| Package Manager | npmと`package-lock.json`                                               | Node同梱のnpm workspacesで小規模monorepoに十分であり、追加bootstrap toolが不要。                                     |
| Monorepo        | npm workspaces: `cli`、`packages/*`                                    | orchestration frameworkを増やさず責務と依存境界をpackageとして表現できる。                                           |
| YAML            | `yaml`（eemeli）、`parseDocument`によるYAML 1.2                        | document error、line／column、duplicate key、source tokenを扱え、診断とAST source locationに必要な情報を得られる。   |
| CLI             | Commander                                                              | strictなoption parsing、async action、自動help、test可能なoutput／exit handlingを小さな構成で提供できる。            |
| Test            | Vitest                                                                 | TypeScript／ESMのunit・integration testを追加transform設定なしで高速に実行できる。                                   |
| Build           | TypeScript `tsc -b` project references                                 | bundlerを追加せずpackage依存graphを検証し、declarationを生成できる。配布要件が生じた場合だけCLI bundlingを検討する。 |
| Lint            | ESLint flat configとtypescript-eslint                                  | `DEVELOPER.md`に従い、correctnessとmaintainability ruleを担当する。                                                  |
| Format          | Prettier                                                               | `DEVELOPER.md`に従い、formattingをlint ruleから分離する。                                                            |

dependency versionは`package-lock.json`で固定する。TypeScript strictnessとCLI／test behaviorはcontributor向け契約であるため、major upgradeは個別にreviewする。

## 3. 初期Packageと責務

| Package               | 責務                                                                                              | 依存可能な対象                                        |
| --------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `@gstack/config`      | Project設定の探索、読込、parse、validation。Schemaやsecretを読み込まない                          | Node標準library、ConfigがYAMLである間のみYAML utility |
| `@gstack/schema`      | Schema source fileの探索・読込、source file／diagnostic contractの定義                            | Node標準library                                       |
| `@gstack/parser`      | 1つのSchema sourceをYAML 1.2としてparseし、位置付きsyntax diagnosticと構文専用AST／IRを生成       | `@gstack/schema`、`yaml`                              |
| `@gstack/application` | Provider・構文非依存の正規化Application Model型                                                   | なし                                                  |
| `@gstack/analyzer`    | 全ASTを解析し、semantic／cross-file ruleを検証してApplication Modelまたは順序付きdiagnosticを生成 | `@gstack/parser`、`@gstack/application`               |
| `@gstack/core`        | Config／Schema読込、parse、analysis、validation use caseのorchestrationと境界error変換            | public interfaceを介した上記全package                 |
| `@gstack/cli`         | CLI entry point、`schema validate` adapter、output formatting、文書化されたexit code mapping      | `@gstack/core`、Commander                             |
| `@gstack/mcp`         | 承認済みCore Read／Validate APIをMCP Tool／Resourceとして公開する薄いstdio adapter                | `@gstack/core`、MCP TypeScript SDK                    |

禁止する依存方向は、Schema／Parser／Analyzer／ApplicationからCoreまたはCLIへの依存、基盤packageから具体的Providerへの依存、Analyzerからfilesystem I/Oへの依存である。

## 4. 初期Directory／File

Repository基盤として次のpackage境界を用意する。

```text
cli/
packages/
  application/
  analyzer/
  config/
  core/
  parser/
  schema/
  mcp/
tests/
  fixtures/
```

各packageには必要なmetadata、strict TypeScript project、`src/`を置く。実際の契約を実装するときにだけpublic `src/index.ts` exportを追加し、投機的なinterfaceを作らない。

初期実装fileのpackage境界:

```text
packages/schema/src/{source.ts,diagnostic.ts,loader.ts,index.ts}
packages/config/src/{types.ts,loader.ts,index.ts}
packages/parser/src/{ast.ts,parser.ts,index.ts}
packages/application/src/{application.ts,model.ts,index.ts}
packages/analyzer/src/{analyzer.ts,rules/,index.ts}
packages/core/src/{validate-schema.ts,index.ts}
cli/src/{main.ts,program.ts,commands/schema-validate.ts}
tests/fixtures/schema/{valid,syntax-invalid,semantic-invalid}/
```

## 5. 実装Phaseと完了条件

### Phase 0: Repository基盤

1. npm workspaces、package metadata、Node policy、root script、strict共通TypeScript設定、ESLint、Prettier、Vitestを用意する。
2. 空のpackage境界とroot TypeScript solutionを追加する。
3. Architecture ruleと設計判断を`AGENTS.md`と本計画へ記録する。

dependency installが再現可能で、format／lint／typecheck／test scriptが成功し、各初期packageを独立したTypeScript projectとして拡張できれば完了とする。

### Phase 1: 共通Source／Diagnostic契約

1. `@gstack/schema`でimmutableなsource file identity／content／location型を定義する。
2. 安定したcode、phase、severity、message、file、range、optional hintを持つ構造化diagnostic contractを定義する。
3. diagnosticの安定した順序とline／column規則をtestする。

後続stageがlibrary固有errorをpackage境界からthrowせず、複数diagnosticを決定的に報告できれば完了とする。

### Phase 2: Config Loader／Schema Loader

1. process全体のstateを変更せずProject Rootと`gstack.yaml`を探索する。
2. secretを含まないProject設定だけを読み込み、確定済みConfig契約に従って不正／未知設定を拒否する。
3. Project RootからSchema pathを解決し、`.yaml` fileを決定的に探索し、duplicate／衝突pathを拒否し、parseせずsource objectを返す。

Loaderをtemporary fileで独立してunit testし、順序、missing／unreadable file errorを検証し、Provider処理を含まなければ完了とする。

### Phase 3: YAML Parserと構文専用AST／IR

1. YAML 1.2 documentをstrictなduplicate key checkとsource location付きでparseする。
2. YAML library nodeをgstack所有AST nodeへ変換し、第三者library型を`@gstack/parser`外へ公開しない。
3. document数、mapping／sequence／scalar形状、許可された構造keyだけをsyntax／shapeとして検証し、診断用source情報を保持する。

valid fixtureが決定的なASTを生成し、不正YAML／duplicate keyが位置付きdiagnosticとなり、未知Relation targetなどのsemantic errorをParserが判断しなければ完了とする。

Status: 完了。Parserはgstack所有ASTを生成し、framework管理keyとnode形状を検証する。`null`などのscalarはdomain validityを判断せず保持する。

### Phase 4: Application Model契約

1. `SCHEMA.md`の確定範囲でApplication、Model、Field、Index、Relation、API、UI、Validation、Permissions、Workflow、Events、Metadataの正規化・immutable・Provider非依存型を定義する。
2. 確定済み判断に基づいてcanonical nameとdefault表現を定義する。

YAML node、file I/O handle、Provider型、CLI型、secret、Generator／runtime stateを含まず、testから直接構築できれば完了とする。

Status: 完了。`@gstack/application`はreadonlyの正規化契約とYAML互換Metadata／source-reference value型を公開し、runtime／infrastructureへ依存しない。

### Phase 5: Semantic AnalyzerとSchema Validation

1. 全ASTをまとめて解析し、cross-file Relationとduplicateを参照できるようにする。
2. 必須property、対応type、Primary Key、Index、Enum、Validation rule互換性、命名、reference、layer依存、Provider非依存性を検証する。
3. error diagnosticがない場合だけ、構文とdefaultを1つのApplication Modelへ正規化する。
4. ruleを小さなpure functionに保ち、diagnosticを集約して決定的にsortする。

文書化されたMVP Schema subsetの全ruleにpositive／negative fixtureがあり、Analyzer testがfilesystem／Providerを必要とせず、同じAST setから常に同じ結果が得られれば完了とする。

Status: 完了。pure ruleによる意味検証に加え、公開`analyzeSchemas` APIがerrorのないASTだけをApplication Modelへ変換する。欠落値へのdefault適用、Metadata変換、Model順序の正規化、diagnostic source reference、deep freezeを実装済み。

### Phase 6: Core Use Caseと最小CLI

1. Loader、Parser、Analyzerを注入可能な境界で統合するCore `validateSchema` use caseを追加する。
2. `--help`、`version`、`schema validate`だけを持つ`gstack` executableを追加する。未実装commandが成功したように見せてはいけない。
3. 構造化resultを`CLI.md`のexit code、安定したhuman output、machine-readable outputへmappingする。

CLI contract testで成功、syntax／semantic／configuration error、help／version、stdout／stderr、working directory、exit codeを検証し、Provider／Migration／Generator／Deploy codeをloadしなければ完了とする。

Status: 完了。CoreはParserとAnalyzerを統合し、syntax／semantic levelを区別するValidationとApplication Model Read APIを提供する。CLI adapterは同じValidation APIを利用する。built CLIのprocess-level contract testでhelp／version、Project Root探索、human／JSON output、syntax／semantic／configuration error、stdout／stderr、exit codeを検証済み。

### 初期AI Integration Slice: Core Read APIとMCP

Semantic Analysis前でも未確定semanticsを推測しない範囲で先行できる。

1. Project Status、Project Context、Schema list／get、syntax validationを構造化Core APIとして公開する。
2. human／JSON CLI formattingをCore外に保ち、`schema validate --json`で分離を検証する。
3. `@gstack/mcp`をRead／Validate専用の薄いstdio adapterとして追加し、Project Contextとdiscover可能なSchema Resourceを提供する。
4. 未実装subsystemを捏造せず、Application Model、Provider、Migration、Generatorの利用不可状態を明示する。
5. `@gstack/config`で最寄り`gstack.yaml`を検出し、Core／CLI／MCPの失敗を安定した構造化errorへ変換する。

CoreをCLIなしで呼び出せ、MCP ToolがCoreへ委譲し、構造化errorがtestされ、危険な操作が存在せず、`MCP.md`と実装が一致すれば完了とする。

## 6. Test計画

- Unit test: Config／Schema Loader、YAMLからASTへの変換、各semantic rule、normalization、diagnostic順序、CLI formatter。
- Boundary test: Schema sourceからAST、AST setからApplication Model、filesystem fixtureからCore validation result。
- CLI test: build済みCLIをfixtureに対して起動し、network／credentialなしでoutputとexit codeを検証する。
- Architecture test: workspace package manifestとTypeScript project referenceが明示的な依存allowlistに一致することを検証し、Core／基盤package／CLIからProvider固有importとGoogle固有識別子を禁止する。`npm run test:architecture`で実行し、`npm run check`にも含める。
- Property／fuzz testは後回しとする。duplicate key、alias、standard tag、multiple document、null、numeric coercion、Unicode、不正indentationのYAML corpusは`tests/fixtures/schema/`へ追加済み。

## 7. 確定済み実装判断

旧Open Questionは`DECISIONS.md` D-001からD-014で解決済みである。Config、Schema version／grammar、AST、Validation、Application Model、Migration、Generator、Provider abstraction、machine-readable output、package公開はこれらに従う。`TODO.md`の残項目は実装／将来機能であり、異なる契約を推測する許可ではない。

## 8. 明示的な対象外Scope

Core Foundation中は、Migration diff／plan／apply／history／rollback、Provider Registry実装、Google code／credential、Generator／Template／React、runtime CRUD／API code、Authentication、Deploy、Plugin loading、watch mode、remote／write可能MCP、AI documentation生成を実装しない。

## 9. 次Phase: Migration Engine準備

Core Foundation完了後はRoadmap 0.2へ進む。実装順序は次のとおりとする。

1. `docs/TODO.md`のMigration設計blockerを解消し、`docs/MIGRATION.md`と`docs/DECISIONS.md`へ確定事項を反映する。
2. Provider非依存のOperation、Diff、Plan、Risk、Reversibility契約を定義する。
3. Application Model snapshot同士を比較するpure Diff Engineを実装する。Provider stateをbaselineに使用しない。
4. ordered Operationとaggregate riskを生成するpure Plannerを実装する。Renameを推測しない。
5. Migration File、checksum、history contractを実装する。
6. Provider capability contractが利用可能になってからcapability checkを統合する。
7. Apply／Rollbackは明示的な安全設計とProvider境界が完成するまで実装しない。

Status: 実装中。Provider非依存のOperation／Plan、pure Diff、Migration File／checksum／strict YAML、History状態遷移、checksum付きApplication Model snapshot、History Storage port／Repositoryを実装済み。capability contractとMigration Read APIへ進む。Providerを実際に変更するApply／Rollbackは引き続き未実装とする。
