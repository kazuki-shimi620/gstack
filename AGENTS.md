# gstack Agent Rules

This repository implements gstack, a CLI-first, AI-first, schema-first application framework. These rules apply to every change in this repository.

## Read before changing code

- Read `README.md` first, then the documents relevant to the change before designing or implementing it. Start with `docs/ARCHITECTURE.md`; then consult the applicable specifications under `docs/`.
- Treat the **Architecture Invariants** in `docs/ARCHITECTURE.md` and `docs/DEVELOPER.md` as mandatory constraints. If a requested change conflicts with an invariant, stop and report the conflict instead of silently changing the architecture.
- Treat accepted decisions in `docs/DECISIONS.md` as normative. Do not reopen or bypass them implicitly; propose and document an explicit replacement decision when change is necessary.
- Treat Schema as the Single Source of Truth for the desired application state. Config, migrations, generated artifacts, and provider state must not become competing application definitions.

## Preserve responsibility boundaries

- Keep the compiler pipeline explicit: source loading -> YAML parsing -> AST/IR -> semantic analysis -> normalized Application Model. Do not mix Parser, AST/IR, Semantic Analyzer, or Application Model responsibilities.
- The Parser handles syntax and source representation only. It must not resolve relations, apply semantic defaults, enforce domain meaning, or access providers.
- Semantic analysis is the only stage that validates cross-node meaning and produces the normalized Application Model. Downstream engines consume the Application Model, not raw YAML or provider-specific data, unless an accepted design decision explicitly says otherwise.
- Core may depend on provider contracts and registry abstractions, but never directly on a provider implementation. Do not put Google-specific code, types, configuration, terminology, or API assumptions in Core.
- Migration Engine produces and processes provider-independent operations. Never add SQL, Google Sheets operations, or other provider-specific behavior to it. Never apply a destructive migration implicitly; require a reviewed plan and explicit authorization.
- Generator must not depend on Provider, a live database, or runtime state. Generated code and manual code must remain separate; generators own only designated generated paths and must not overwrite manual paths.
- Providers implement provider contracts and external-service behavior. They must not parse Schema, own CLI argument parsing, or redefine the Application Model.
- CLI is an adapter over application/Core services. It must not call Google APIs, provider implementations, or other external services directly.
- Core APIs return structured data without human-facing presentation. CLI, MCP, and future adapters must reuse those APIs and must not reimplement parsing, validation, migration, generation, or provider logic.
- MCP is a thin adapter package. Keep its default surface read/validate-only; do not expose apply, rollback, deploy, remove, or delete operations without an accepted safety design.
- Convert expected failures to stable structured Core errors at package boundaries. CLI and MCP must not expose secrets, raw library errors, internal causes, or stack traces in normal machine-readable output.

## Security and safety

- Never store secrets or credentials in source code, Schema, migration files, generated code, fixtures, snapshots, or logs. Use environment variables or provider-managed secret storage; tests must use obvious non-secret fakes.
- Never infer a rename or approve a destructive operation solely from a Schema diff. Preserve plan-before-apply, dry-run, risk classification, and explicit destructive-operation authorization.
- Do not edit an already-applied migration. Preserve checksums and migration history.

## Change design and quality

- For a new feature, consider responsibilities in this order: Schema -> Application Model -> Core / Generator / Provider -> CLI. Add a CLI command only when an explicit operation is required.
- Update the corresponding design document whenever behavior, contracts, dependencies, or public CLI/Schema semantics change. Record unresolved architectural choices instead of guessing.
- Keep packages cohesive, dependency directions visible, and components replaceable through small interfaces. Prefer pure functions and injected I/O so parsing, analysis, orchestration, and provider adapters remain independently testable.
- Use TypeScript Strict Mode. Do not weaken strictness globally to work around an implementation issue; justify any narrow exception next to the code.
- Every behavior change requires proportionate unit tests, boundary/integration tests where packages interact, and CLI contract tests for user-visible behavior. Tests must be deterministic and must not require live provider credentials unless explicitly marked as provider integration tests.
- Keep generated and build outputs out of source control unless a design document explicitly requires a checked-in artifact.

## Source of detailed specifications

- `README.md`: documentation entry point and current implementation status
- `docs/ARCHITECTURE.md`: system structure, dependency rules, and invariants
- `docs/REQUIREMENTS.md`: functional and non-functional requirements
- `docs/CLI.md`: public CLI contract and exit codes
- `docs/SCHEMA.md`: DSL structure and validation intent
- `docs/MIGRATION.md`: planning, safety, history, and abstract operations
- `docs/GENERATOR.md`: artifact ownership and generation rules
- `docs/PROVIDER.md`: provider contracts, capabilities, and isolation
- `docs/DEVELOPER.md`: internal modules, data flow, testing, and coding rules
- `docs/ROADMAP.md`: implementation order and milestone scope
- `docs/PLAN.md`: current implementation phases and implementation order
- `docs/MCP.md`: Core API boundary, MCP tools/resources, transport, and safety policy
- `docs/TODO.md`: remaining implementation and future work
- `docs/DECISIONS.md`: accepted MVP contracts and cross-document architecture decisions
