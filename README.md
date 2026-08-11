# gstack

gstack is a CLI-first, AI-first, Schema-first application framework. It compiles a declarative application Schema into a normalized Application Model that later drives validation, migrations, generation, documentation, and Provider execution.

## Start here

Read these documents in order before implementing framework behavior:

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system structure and invariants
2. [`docs/DECISIONS.md`](docs/DECISIONS.md) — accepted MVP contracts
3. [`docs/PLAN.md`](docs/PLAN.md) — current implementation order
4. The subsystem specification relevant to the change

Repository-development agents must also obey [`AGENTS.md`](AGENTS.md). That file stays at the repository root for automatic agent discovery.

## Documentation

| Document | Purpose |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Architecture, dependency rules, invariants |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Accepted cross-cutting MVP decisions |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Functional and non-functional requirements |
| [`docs/CLI.md`](docs/CLI.md) | Public CLI contract |
| [`docs/SCHEMA.md`](docs/SCHEMA.md) | Schema DSL specification |
| [`docs/MIGRATION.md`](docs/MIGRATION.md) | Migration planning and safety |
| [`docs/GENERATOR.md`](docs/GENERATOR.md) | Artifact generation and ownership |
| [`docs/PROVIDER.md`](docs/PROVIDER.md) | Provider interfaces and isolation |
| [`docs/DEVELOPER.md`](docs/DEVELOPER.md) | Internal modules and development rules |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Milestones and development order |
| [`docs/PLAN.md`](docs/PLAN.md) | Current implementation phases |
| [`docs/MCP.md`](docs/MCP.md) | MCP tools, resources, transport, safety |
| [`docs/TODO.md`](docs/TODO.md) | Remaining implementation and future work |

## Current implementation status

Implemented foundation:

- npm/TypeScript monorepo and strict project boundaries
- Project-root discovery
- strict `gstack.yaml` loading and version validation
- Schema source loading and YAML 1.2 syntax diagnostics
- structured Core Read API and machine-result envelope
- `schema validate --json`
- read-only local stdio MCP tools and resources

Semantic Analyzer, Application Model construction, Migration, Generator, Provider implementations, and Deploy remain later phases.
