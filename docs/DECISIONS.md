# gstack Accepted MVP Decisions

> Documentation index: [`../README.md`](../README.md)

> Status: Accepted. These decisions were approved together and are normative for MVP implementation. Detailed subsystem documents remain authoritative; update both when a decision changes.

## D-001 Project Config

`gstack.yaml` is required and is the project-root marker. MVP shape:

```yaml
version: 1
name: sample-app
schemaVersion: 1
schema:
  directory: schema
```

All four fields are required. Unknown keys are errors. Paths are relative to the project root. Provider and Generator sections may be added later as optional, typed sections; secrets are never valid Config values. Environment variables may supply secrets and operational overrides but may not redefine application semantics. Exact override names will be added with those features.

## D-002 Schema Version

Schema version is declared once as `schemaVersion` in `gstack.yaml`, not in each model file. It is required. Unsupported versions are Configuration Errors. MVP supports only integer version `1`.

## D-003 MVP Schema Grammar

- One YAML file contains exactly one YAML document and one Model.
- Required root keys are `name`, `model`, and `database`.
- Optional root keys are `description`, `api`, `ui`, `validation`, `permissions`, `workflow`, `events`, and `metadata`.
- `description` is root-level. `model.displayName` is required.
- `database.primaryKey` and a non-empty `database.columns` mapping are required. Primary keys are never generated implicitly.
- Every Column requires `type`. Only types listed as initial types in `SCHEMA.md` are accepted. Enum Columns require a non-empty, unique `values` sequence.
- Index entries require a stable `name` and a non-empty `columns` sequence; `unique` defaults to `false`.
- MVP Relation entries are named mappings under `database.relations`. Each requires `type: belongs_to`, local `field`, target `model`, and target `references`. Additional relation kinds remain future work.
- Validation keys must name an existing Column. String/text rules are `minLength`, `maxLength`, and `pattern`; numeric rules are `min` and `max`. `required` remains a Column property.
- Unknown keys at every framework-owned level are errors. `metadata` is the only open mapping.
- Boolean feature flags default to `false`; optional collections default to empty. Defaults are applied by Semantic Analyzer, never Parser.

## D-004 AST and IR

MVP has one gstack-owned syntax representation called AST; “Raw IR” in older documents refers to this AST. It preserves file identity, source ranges, YAML structure, and explicitly written values. It does not contain defaults, resolved relations, semantic normalization, Provider data, or YAML-library node types. No second IR is introduced until a demonstrated need exists.

## D-005 Validation Ownership

```text
YAML Parser       -> YAML 1.2 syntax and duplicate keys
AST Builder       -> node shapes and allowed syntax
Semantic Analyzer -> types, names, defaults, duplicates, indexes, enums, relations
Core              -> composed validateSchema use case
```

There is no separate Validation Engine in MVP. Validation levels are `syntax`, `semantic`, and later `provider`.

## D-006 Application Model

The normalized, immutable, Provider-independent model contains Models, Fields, Indexes, Relations, API, UI, Permissions, Workflows, Events, Metadata, and optional diagnostic source references. Missing optional sections normalize to empty values. It contains no YAML-library, filesystem handle, CLI, MCP, concrete Provider, Generator-template, runtime-state, or secret types.

## D-007 Migration Baseline

The authoritative comparison baseline is the last successfully applied Application Model snapshot. Provider introspection is used for drift detection and capability checks, not as an implicit desired-state or migration baseline. Migration history records which snapshot was applied.

## D-008 Migration Plan

A plan is structured data with ordered operations, aggregate `safe | caution | destructive` risk, a destructive flag, warnings, reversibility, and capability results. Operations have stable IDs. Rename is never inferred or applied automatically; it requires explicit migration intent.

## D-009 Generator Input

Generator input is Application Model plus Generator Config and Template. Generator never consumes raw YAML/AST or live Provider/Database state.

## D-010 Generated Ownership

Generator owns only `generated/`. It never writes to `app/` or `custom/`. A Generated Artifact Manifest records owned outputs; stale deletion is limited to paths previously recorded in that manifest.

## D-011 Core and Provider

“Core does not know Provider” means Core may depend on Provider interfaces and registry abstractions but must never depend on, import, configure, or name a concrete Provider implementation.

## D-012 Provider Capabilities

Top-level capabilities are Database, API, Authentication, Storage, and Deploy. Migration support is also declared per abstract Operation as `native`, `emulated`, or `unsupported`.

## D-013 Machine-readable Envelope

CLI JSON and MCP Tool structured content use the same inner envelope.

Success:

```json
{ "ok": true, "data": {}, "warnings": [] }
```

Failure:

```json
{ "ok": false, "error": { "code": "...", "category": "...", "message": "..." } }
```

CLI controls stdout/stderr and exit codes; MCP controls protocol content and `isError`. Human formatters remain Adapter-owned.

## D-014 Package Publication

Public-package candidates are `@gstack/core`, `@gstack/cli`, `@gstack/mcp`, `@gstack/provider`, and concrete Provider packages. Parser, Analyzer, Schema, Config, and Application packages remain internal implementation packages. All MVP packages use one synchronized version. Public stability begins at 1.0 unless explicitly documented earlier.
