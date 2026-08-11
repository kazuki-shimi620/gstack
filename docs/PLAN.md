# gstack Initial Implementation Plan

> Documentation index: [`../README.md`](../README.md)

> Scope: Core Foundation through Schema Validation plus an early read-only Core API/MCP integration slice. Google Provider, Migration Apply, Generator implementations, React, deploy, authentication, and plugin loading are intentionally excluded.

## 1. Design baseline

gstack is a compiler/build-system-style framework. YAML Schema describes desired application state and is compiled through a provider-independent pipeline:

```text
gstack.yaml -> Config Loader
schema/*.yaml -> Schema Loader -> YAML Parser -> AST/IR
                                            -> Semantic Analyzer
                                            -> Application Model
                                            -> Schema Validation result
CLI / MCP -> Core orchestration -------------------------------^
```

The raw Schema syntax is not an engine input. The normalized Application Model is the boundary consumed by later Migration, Generator, documentation, and provider-validation work. This interpretation follows the architecture invariants; the contradictory Generator wording remains an open documentation question below.

## 2. Technical decisions

| Area | Decision | Reason |
| --- | --- | --- |
| Runtime | Node.js 24 LTS, ESM | Use a supported production LTS line and standard Node module semantics. CI and releases should pin the latest Node 24 patch. |
| Language | TypeScript, `strict: true`, additional safe-index/optional-property checks | Required by `DEVELOPER.md`; compiler boundaries benefit from precise unknown/optional data handling. |
| Package manager | npm with `package-lock.json` | npm is bundled with Node and its workspaces are sufficient for this small monorepo; no extra bootstrap tool is needed. |
| Monorepo | npm workspaces: `cli` and `packages/*` | Makes responsibility and dependency boundaries publishable without introducing an orchestration framework. |
| YAML | `yaml` (eemeli), YAML 1.2 via `parseDocument` | It exposes document errors, line/column tracking, duplicate-key handling, and source tokens needed for useful diagnostics and AST source locations. |
| CLI | Commander | Small, established command parser with strict option parsing, async actions, generated help, and testable output/exit handling. |
| Tests | Vitest | Fast TypeScript/ESM unit and integration tests with a simple setup and no separate transform configuration. |
| Build | TypeScript `tsc -b` project references | Enforces the package dependency graph and emits declarations without adding a bundler. Add CLI bundling only if distribution requirements later justify it. |
| Lint | ESLint flat config with typescript-eslint | Matches `DEVELOPER.md`; use it for correctness and maintainability rules. |
| Format | Prettier | Matches `DEVELOPER.md`; keep formatting separate from lint rules. |

Dependency versions are locked by `package-lock.json`. Major upgrades require their own review because TypeScript strictness and CLI/test behavior are contracts for contributors.

## 3. Initial packages and responsibilities

| Package | Responsibility | May depend on |
| --- | --- | --- |
| `@gstack/config` | Locate, read, parse, and validate project configuration; never load Schema or secrets | Node standard library, YAML utility only if config remains YAML |
| `@gstack/schema` | Discover and read Schema source files; define source-file and diagnostic contracts | Node standard library |
| `@gstack/parser` | Parse one Schema source as YAML 1.2, report syntax diagnostics with locations, and build syntax-only AST/IR | `@gstack/schema`, `yaml` |
| `@gstack/application` | Provider- and syntax-independent normalized Application Model types | none |
| `@gstack/analyzer` | Analyze all ASTs, validate semantic/cross-file rules, and produce either an Application Model or ordered diagnostics | `@gstack/parser`, `@gstack/application` |
| `@gstack/core` | Orchestrate config load, Schema load, parse, analysis, and validation use cases; map errors at boundaries | all packages above through public interfaces |
| `@gstack/cli` | CLI entry point, `schema validate` adapter, output formatting, and documented exit-code mapping | `@gstack/core`, Commander |
| `@gstack/mcp` | Thin stdio adapter exposing approved Core Read/Validate APIs as MCP tools and resources | `@gstack/core`, MCP TypeScript SDK |

Forbidden dependency directions include schema/parser/analyzer/application packages depending on Core or CLI, any foundation package depending on a concrete Provider, and Analyzer performing filesystem I/O.

## 4. First directories and files

The repository foundation creates these package boundaries now, without feature implementations:

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

Each package initially receives only package metadata, a strict TypeScript project, and an empty `src/` placeholder. During implementation, introduce public `src/index.ts` exports only with the first real contract; do not create speculative interfaces.

Initial implementation files (implemented files are retained here as a package-boundary map):

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

## 5. Implementation phases and completion criteria

### Phase 0: repository foundation

1. Establish npm workspaces, package metadata, Node policy, root scripts, strict shared TypeScript settings, ESLint, Prettier, and Vitest.
2. Add empty package boundaries and a root TypeScript solution file.
3. Document architecture rules and decisions in `AGENTS.md` and this plan.

Complete when dependency installation is reproducible, formatting/lint/typecheck/test scripts execute successfully with no implementation code, and every initial package can later become an independent TypeScript project.

### Phase 1: shared source and diagnostic contracts

1. Define immutable source-file identity/content/location types in `@gstack/schema`.
2. Define a structured diagnostic contract: stable code, phase, severity, message, file, range, and optional hint.
3. Test stable diagnostic ordering and line/column conventions.

Complete when all later stages can report multiple deterministic diagnostics without throwing library-specific errors across package boundaries.

### Phase 2: Config Loader and Schema Loader

1. Locate the project root and `gstack.yaml` without changing process-wide state.
2. Load only non-secret project configuration; reject malformed/unknown configuration according to the accepted config contract.
3. Resolve Schema paths relative to the project root, discover `.yaml` files deterministically, reject duplicate/colliding paths, and return source objects without parsing them.

Complete when loaders are independently unit-tested with temporary files, deterministic ordering, missing/unreadable-file errors, and no provider behavior.

### Phase 3: YAML Parser and syntax-only AST/IR

1. Parse YAML 1.2 documents with strict duplicate-key checks and source locations.
2. Convert YAML library nodes into gstack-owned AST nodes; do not expose third-party node types outside `@gstack/parser`.
3. Perform syntax/shape checks only: document count, mapping/sequence/scalar shapes, and recognizable structural keys. Preserve enough source information for diagnostics.

Complete when valid fixtures produce deterministic ASTs, malformed YAML and duplicate keys produce located diagnostics, and semantic errors (unknown relation target, invalid domain type) are not decided by the Parser.

Status: complete. Parser builds the generic owned AST and checks framework-owned keys and structural node kinds while intentionally preserving scalar values such as `null` without deciding domain validity.

### Phase 4: Application Model contracts

1. Define normalized, immutable, provider-independent types for Application, Model, Field, Index, Relation, API, UI, Validation, Permissions, Workflow, Events, and Metadata only to the extent accepted by `SCHEMA.md`.
2. Define canonical naming and default representation after the relevant open questions are resolved.

Complete when the model contains no YAML nodes, file I/O handles, provider types, CLI types, secrets, or generator/runtime state and can be constructed directly in tests.

Status: complete. `@gstack/application` exposes readonly normalized contracts and YAML-compatible Metadata/source-reference value types without runtime or infrastructure dependencies.

### Phase 5: Semantic Analyzer and Schema Validation

1. Analyze the complete AST set so cross-file relations and duplicates are visible.
2. Validate required properties, supported types, primary keys, indexes, enums, validation rule compatibility, naming, references, layer dependencies, and provider independence.
3. Normalize accepted syntax/defaults into one Application Model only when there are no error diagnostics.
4. Keep rules small and pure; aggregate and sort diagnostics deterministically.

Complete when the documented MVP Schema subset has positive and negative fixtures for every rule, analyzer tests require no filesystem/provider, and the same AST set always produces the same result.

### Phase 6: Core use case and minimum CLI

1. Add a Core `validateSchema` use case that composes loaders, parser, and analyzer through injected boundaries.
2. Add the `gstack` executable with `--help`, `version`, and `schema validate` only. Other documented commands remain unimplemented and must not pretend to succeed.
3. Map structured outcomes to `CLI.md` exit codes, stable human output, and a reserved path for future machine-readable output.

Complete when CLI contract tests cover success, syntax error, semantic error, configuration error, help/version, stderr/stdout separation, current working directory handling, and exit codes. No provider, migration, generation, or deploy code is loaded.

### Early AI integration slice: Core Read API and MCP

This slice may progress before semantic analysis only where it does not guess unresolved Schema semantics.

1. Expose structured project status, aggregated Project Context, Schema list/get, and syntax-validation methods from `@gstack/core`.
2. Keep human and JSON CLI formatting outside Core; validate the split with `schema validate --json`.
3. Add `@gstack/mcp` as a thin stdio adapter with read/validate-only tools, aggregated Project Context, and discoverable Schema resources.
4. Mark unavailable subsystems and syntax-only validation explicitly rather than fabricating Application Model, Provider, Migration, or Generator results.
5. Detect the nearest `gstack.yaml` project marker in `@gstack/config` and convert Core/CLI/MCP failures to stable structured error details.

Complete when Core can be called without CLI, MCP tool calls delegate to Core, structured errors are tested, dangerous operations are absent, and `MCP.md` matches the implementation.

## 6. Test plan

- Unit tests: Config and Schema loaders, YAML-to-AST conversion, each semantic rule, normalization, diagnostic ordering, and CLI formatters.
- Boundary tests: Schema source -> AST; AST set -> Application Model; filesystem fixture -> Core validation result.
- CLI tests: spawn the built CLI against fixtures and assert output plus exit code without network or credentials.
- Architecture tests: verify workspace dependency directions from package manifests and prohibit imports of provider packages from Core/foundation packages.
- Property/fuzz tests are deferred; first preserve a corpus of YAML edge cases (duplicate keys, aliases, tags, multiple documents, nulls, numeric coercion, Unicode, and invalid indentation).

## 7. Accepted implementation decisions

The former open questions are resolved by `DECISIONS.md` D-001 through D-014. Implementations must follow those decisions for Config, Schema version/grammar, AST, Validation, Application Model, Migration, Generator, Provider abstraction, machine-readable output, and package publication. Remaining work in `TODO.md` is implementation/future-feature work rather than an invitation to infer a different contract.

## 8. Explicitly deferred scope

Do not implement during the Core Foundation slice: Migration diff/plan/apply/history/rollback, Provider Registry implementation, Google code or credentials, Generator/Templates/React, runtime CRUD/API code, authentication, deployment, plugin loading, watch mode, remote/write-capable MCP, or AI documentation generation.
