# gstack MCP Integration

> ドキュメント一覧: [`../README.md`](../README.md)

> Version: 0.1.0（初期Read専用integration）

## 1. 目的

gstack MCPは、local AI AgentがCLIや将来のToolと同じprogrammatic Core APIを通してgstack projectを参照・検証できるようにする。

```text
                 @gstack/core
                /      |      \
             CLI      MCP    将来のadapter
```

MCPはbusiness logic layerではなくadapterである。Schema parsing、semantic analysis、migration planning、artifact生成、Provider操作、CLI output formattingを独自に実装してはいけない。

## 2. PackageとTransport

packageは`packages/mcp`に置き、将来のpackage名`@gstack/mcp`を想定する。実行fileは`gstack-mcp`とする。

MVPのtransportはstdioだけとする。`GSTACK_PROJECT_ROOT`が明示されていない場合、Coreはcurrent working directoryから親方向へ探索し、最も近い`gstack.yaml`を含むdirectoryを選択する。stdoutはMCP protocol message専用とし、失敗と診断はstderrへ出力する。

Remote／HTTP MCP、authentication、複数project hosting、永続server stateはscope外とする。

localでbuild・実行して確認する場合:

```bash
npm run build
GSTACK_PROJECT_ROOT=/absolute/path/to/project npm run mcp
```

MCP hostは`node /absolute/path/to/gstack/packages/mcp/dist/main.js`を起動し、対象gstack projectをworking directoryに設定するか、`GSTACK_PROJECT_ROOT`を渡す。wrapperのoutputをserver stdoutへ出力してはいけない。

## 3. Core API境界

`@gstack/core`は`loadProject()`と`GstackProject` interfaceをexportする。初期Read surfaceは次のとおり。

```ts
const project = await loadProject({ root });

await project.getStatus();
await project.getProjectContext();
await project.listSchemas();
await project.getSchema(name);
await project.validateSchema();
await project.getMigrationStatus();
await project.listMigrationHistory();
await project.previewMigrationPlan();
await project.previewGeneration();
```

すべてのmethodは構造化データを返す。terminal color、説明的な成功message、MCP content block、Provider固有型を含めない。

Validationは、Parserで失敗した場合に`level: "syntax"`、構文通過後は`level: "semantic"`を返す。Application ModelはSemantic Validation成功時だけ生成する。この契約は`DECISIONS.md` D-003からD-006に従う。

`getProjectContext()`は、現在利用可能なstatus、Schema summary、validation resultを集約する。capability mapではSemantic ValidationとApplication Modelを`available`とする。Migration PlanはHistory Storageを実装するReaderが注入されている場合だけ`available`、Generator Artifactは`generator`設定が存在する場合だけ`available`とする。Provider StatusはProvider Readerが注入された場合だけ`available`とし、利用できないstateを捏造してはいけない。

Migration Read APIはCoreへ注入されたProvider非依存Readerへ委譲する。Core自身がHistoryの保存先やProvider実装を選択してはいけない。Plan previewはSemantic Validation成功時のApplication ModelだけをtargetとしてReaderへ渡し、不正SchemaまたはReader未設定は安全なCore errorとして返す。

## 4. Tool

| Tool                     | Core呼出                         | 分類                             |
| ------------------------ | -------------------------------- | -------------------------------- |
| `get_project_status`     | `project.getStatus()`            | Read専用、idempotent             |
| `list_schemas`           | `project.listSchemas()`          | Read専用、idempotent             |
| `get_schema`             | `project.getSchema(name)`        | Read専用、idempotent             |
| `validate_schema`        | `project.validateSchema()`       | 副作用のないRead計算、idempotent |
| `list_providers`         | `project.listProviders()`        | Read専用、idempotent             |
| `get_provider`           | `project.getProvider(name)`      | Read専用、idempotent             |
| `get_migration_status`   | `project.getMigrationStatus()`   | Read専用、idempotent             |
| `list_migration_history` | `project.listMigrationHistory()` | Read専用、idempotent             |
| `preview_migration_plan` | `project.previewMigrationPlan()` | 副作用のないRead計算、idempotent |
| `preview_generation`     | `project.previewGeneration()`    | 副作用のないRead計算、idempotent |

Tool responseは互換性のためのJSON textと、machine consumer向け`structuredContent`を含む。すべてのToolはD-013で確定したenvelopeを使う。成功データは`data`内のnamespace（`status`、`schemas`、`schema`、`validation`）に格納する。

```json
{
  "ok": true,
  "data": { "status": {} },
  "warnings": []
}
```

想定内の失敗はCLIと同じ安全なCore error detailを使用する。MCP Tool errorは`isError: true`を設定し、次のようなenvelopeを返す。

```json
{
  "ok": false,
  "error": {
    "code": "SCHEMA_NOT_FOUND",
    "category": "schema",
    "message": "Schema not found: users"
  }
}
```

想定外のexceptionは`INTERNAL_ERROR`へ変換し、stack traceやlibrary／filesystemのerror messageをmachine outputへ露出しない。

Migration ToolはCore Read APIへだけ委譲し、History StorageのReaderが注入されていないprojectでは`MIGRATION_NOT_AVAILABLE`を返す。Plan previewはMigration Fileを作成せず、Provider capability評価やApplyも実行しない。Provider ToolはCoreのCatalog Read APIへだけ委譲し、Factory初期化、health check、credential accessを行わない。Generated artifact inventory Toolは、対応するCore Read APIが存在してから追加する。MCP固有の代替実装は禁止する。

`preview_generation`はCoreの副作用なしpreviewへ委譲し、Artifact write／deleteとManifest更新を実行しない。write可能な`generate` Toolは登録しない。

## 5. Resource

| URI                          | 目的                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `gstack://project`           | 現在の構造化Project Status                                                           |
| `gstack://project-context`   | 最初のproject entry向けに集約したstatus、Schema、Validation、capability availability |
| `gstack://config`            | Validation済みでsecretを含まない`gstack.yaml`設定                                    |
| `gstack://schema`            | Schema index                                                                         |
| `gstack://schema/{name}`     | 1つのraw YAML Schema source。resource templateからdiscover可能                       |
| `gstack://application-model` | Validation成功時の正規化済みApplication Model。失敗時は`null`                        |
| `gstack://provider`          | 登録済みProviderのManifest／capability一覧。live stateを含まない                      |
| `gstack://provider/{name}`   | 1つのProvider Manifest／capability。resource templateからdiscover可能                |
| `gstack://migration/status`  | 注入済みHistory Storageから集約したMigration状態                                     |
| `gstack://migration/history` | version順のMigration History                                                         |
| `gstack://architecture`      | Architecture Invariantsとrepository Agent ruleへの入口                               |

ResourceはRead専用contextを公開する。Validationは外部副作用を持たないが計算を実行するため、ResourceではなくToolとする。

## 6. 安全方針

serverは10個のRead／Validate Toolだけを明示的なallowlistで登録する。次のToolは登録しない。

- Migration Apply／Rollback
- Deploy／Publish
- Providerのinstall／remove／use
- Schemaのcreate／update／delete
- generated fileへの書込
- Credential／Secretへのaccess

登録する全ToolにRead専用、非破壊、idempotentのannotationを付ける。危険なToolを追加するには、明示的な確認、plan-before-apply、risk output、破壊操作承認、auditability、AI Agent向け挙動を定めた別の確定済み設計が必要である。MCP accessだけから操作権限を推測してはいけない。

## 7. CLIとの関係

`gstack schema validate`と`validate_schema`は同じCore methodを呼ぶ。CLI presentationはformatter functionへ分離する。

```text
Core ValidationResult
        ├── Human formatter
        ├── JSON formatter (`--json`)
        └── MCP structured response
```

CLI JSONとMCP Tool structured contentは`DECISIONS.md` D-013の安定したMVP envelopeを共有する。CLIはstdout／stderrとexit codeを所有し、MCPは`isError`とprotocol contentを所有する。

## 8. Test

- Core API testは構造化status、Schema lookupの安全性、syntax diagnosticを検証する。
- Formatter testはpresentationがCore外に保たれていることを検証する。
- MCP handler testはfake `GstackProject`への直接委譲を検証する。
- MCP protocol testはmemory上のclient／server transportを使い、Toolのlist／call、Resource list、Schema未検出error、危険なToolが存在しないことを検証する。

Google API、Provider、Credential、network service、remote MCP transportを必要とするtestを作ってはいけない。
