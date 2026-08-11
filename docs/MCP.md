# gstack MCP Integration

> Documentation index: [`../README.md`](../README.md)

> Version: 0.1.0 (Initial read-only integration)

## 1. Purpose

gstack MCP lets local AI agents inspect and validate a gstack project through the same programmatic Core API used by CLI and future tools.

```text
                 @gstack/core
                /      |      \
             CLI      MCP    Future adapters
```

MCP is an adapter, not a business-logic layer. It must not parse Schema, analyze semantics, plan migrations, generate artifacts, operate providers, or format CLI output independently.

## 2. Package and transport

The package is `packages/mcp` and is prepared for the future package name `@gstack/mcp`. Its executable is `gstack-mcp`.

The MVP transport is stdio only. Unless `GSTACK_PROJECT_ROOT` is explicitly set, Core walks upward from the current working directory and selects the nearest directory containing a `gstack.yaml` file. stdout is reserved for MCP protocol messages; failures and diagnostics are written to stderr.

Remote/HTTP MCP, authentication, multi-project hosting, and persistent server state are out of scope.

Build and run locally from the project to inspect:

```bash
npm run build
GSTACK_PROJECT_ROOT=/absolute/path/to/project npm run mcp
```

An MCP host should spawn `node /absolute/path/to/gstack/packages/mcp/dist/main.js` and set its working directory to the target gstack project (or provide `GSTACK_PROJECT_ROOT`). Do not print wrapper output to the server's stdout.

## 3. Core API boundary

`@gstack/core` exports `loadProject()` and the `GstackProject` interface. The initial read surface is:

```ts
const project = await loadProject({ root });

await project.getStatus();
await project.getProjectContext();
await project.listSchemas();
await project.getSchema(name);
await project.validateSchema();
```

All methods return structured data. They contain no terminal colors, prose success messages, MCP content blocks, or provider-specific types.

Current validation is intentionally marked `level: "syntax"`. Semantic validation and Application Model construction remain implementation work; their contracts are fixed by `DECISIONS.md` D-003 through D-006.

`getProjectContext()` aggregates the currently available status, Schema summaries, and validation result. Its capability map explicitly marks Semantic Analyzer, Application Model, Provider Status, Migration Plan, and generated artifact inventory as `not_implemented`; unavailable state is never fabricated.

## 4. Tools

| Tool | Core call | Classification |
| --- | --- | --- |
| `get_project_status` | `project.getStatus()` | Read-only, idempotent |
| `list_schemas` | `project.listSchemas()` | Read-only, idempotent |
| `get_schema` | `project.getSchema(name)` | Read-only, idempotent |
| `validate_schema` | `project.validateSchema()` | Read-only computation, idempotent |

Tool responses include JSON text for compatibility and `structuredContent` for machine consumers. All Tools use the accepted D-013 envelope. Successful data remains namespaced inside `data` (`status`, `schemas`, `schema`, or `validation`).

```json
{
  "ok": true,
  "data": { "status": {} },
  "warnings": []
}
```

Expected failures use the same safe Core error details as CLI. MCP Tool errors set `isError: true` and return an envelope such as:

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

Unexpected exceptions are converted to `INTERNAL_ERROR`; stack traces and library/filesystem error messages are not exposed as machine output.

Tools for Application Model, provider capabilities, migrations, and generated artifacts will be added only after corresponding Core Read APIs exist. MCP-specific substitute implementations are prohibited.

## 5. Resources

| URI | Purpose |
| --- | --- |
| `gstack://project` | Current structured Project Status |
| `gstack://project-context` | Aggregated status, Schema, validation, and capability availability for first project entry |
| `gstack://config` | Validated non-secret `gstack.yaml` configuration |
| `gstack://schema` | Schema index |
| `gstack://schema/{name}` | One raw YAML Schema source; discoverable through the resource template |
| `gstack://architecture` | Entry-point guidance for architecture invariants and repository agent rules |

Resources expose read-only context. Validation remains a Tool because it performs computation, even though it has no external side effects.

## 6. Safety policy

The initial server registers an explicit allowlist of four read/validate tools. It does not register:

- migration apply or rollback
- deploy or publish
- provider install/remove/use
- Schema create/update/delete
- generated-file writes
- credential or secret access

All registered tools declare read-only, non-destructive, and idempotent annotations. Adding a dangerous tool requires a separate accepted design covering explicit confirmation, plan-before-apply, risk output, destructive authorization, auditability, and behavior for AI agents. A tool must never infer authorization from MCP access alone.

## 7. CLI relationship

`gstack schema validate` and `validate_schema` call the same Core method. CLI presentation is isolated in formatter functions:

```text
Core ValidationResult
        ├── Human formatter
        ├── JSON formatter (`--json`)
        └── MCP structured response
```

CLI JSON and MCP Tool structured content share the stable MVP envelope defined in `DECISIONS.md` D-013. CLI still owns stdout/stderr and exit codes; MCP owns `isError` and protocol content.

## 8. Testing

- Core API tests verify structured status, Schema lookup safety, and syntax diagnostics.
- Formatter tests verify presentation remains outside Core.
- MCP handler tests verify direct delegation to a fake `GstackProject`.
- MCP protocol tests use an in-memory client/server transport to list and call tools, list resources, verify missing-Schema errors, and assert that dangerous tools are absent.

No test requires a Google API, Provider, credential, network service, or remote MCP transport.
