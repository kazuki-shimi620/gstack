# gstack TODO

> Documentation index: [`../README.md`](../README.md)

This file tracks work that is required but cannot be safely inferred from the current draft specifications. Resolve each item in the authoritative design document before relying on it in implementation.

## Core foundation decisions

- [x] Define the exact MVP Schema grammar (`DECISIONS.md` D-003).
- [x] Define Schema DSL versioning and compatibility (`DECISIONS.md` D-002).
- [x] Define MVP AST/IR representation (`DECISIONS.md` D-004).
- [x] Define the minimum `gstack.yaml` contract (`DECISIONS.md` D-001).
- [x] Define Validation ownership and levels (`DECISIONS.md` D-005).
- [x] Define Application Model boundaries (`DECISIONS.md` D-006).
- [x] Define package publication/versioning policy (`DECISIONS.md` D-014).

## Later milestone decisions

- [x] Reconcile Generator input (`DECISIONS.md` D-009).
- [x] Define Generated/Manual ownership (`DECISIONS.md` D-010).
- [x] Define Migration baseline and structured plan (`DECISIONS.md` D-007 and D-008).
- [x] Clarify Core/Provider isolation (`DECISIONS.md` D-011).
- [x] Define Provider capability granularity (`DECISIONS.md` D-012).
- [x] Define the machine-readable envelope (`DECISIONS.md` D-013).

## MCP and AI support follow-ups

- [ ] Extend Core Read API only as the corresponding subsystems become real: Application Model, Provider capabilities/health, Migration status/plan, and generated artifact inventory.
- [ ] Add MCP resources for Application Model, providers, migration, and generated artifacts after their Core Read APIs exist.
- [ ] Define generated-project `AGENTS.md` and persisted `PROJECT_CONTEXT.md` formats in Generator design; keep them derived from Config/Schema/Application Model. The current Core/MCP Project Context is an in-memory read model, not this generated artifact.
- [ ] Document installation examples for Codex, Claude, and other MCP hosts after the package distribution command is stable.
- [ ] Add dangerous MCP tools only under a separate design with explicit confirmation, plan-before-apply, and destructive-operation authorization. No such tool is approved today.
