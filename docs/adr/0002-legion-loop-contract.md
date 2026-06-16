# ADR 0002: Legion Loop Contract

## Status

Accepted.

## Context

Your Legion already provides bounded specialists, Domain Packs, Task Context Envelopes, and trace/doctor diagnostics. Loop Engineering adds a longer-lived unit of work: a recurring or goal-driven system that discovers work, delegates it, verifies it, records state, and resumes later.

The risk is that unattended loops can amplify mistakes. A loop needs more than automation; it needs explicit maker/checker separation, durable state, domain evidence, and diagnostics.

## Decision

Legion Loop is a first-class Your Legion concept.

- Loop definitions live in global `legionaries.yaml` under `loops`.
- Loop memory is hybrid: the loop contract is in config, human-readable inbox/state is a repo-relative markdown file, and runtime evidence stays in JSONL traces.
- `verifier` is a protected system agent, separate from `builder`, for independent completion checks.
- Task Context Envelopes include `Loop:` so delegations can be tied to a configured loop.
- The runtime injects a Loop Catalog into agent prompts.
- `create-loop --preset`, `loop-prompt`, and `loop-runs` are the user-facing loop path.
- `doctor` validates loop catalog health and loop runtime evidence.
- Scheduling and external connectors are declared as loop metadata; OpenCode, hooks, cron, CI, or external tooling can start a loop run.

## Consequences

- Existing configs that omit `verifier` fail fast with a setup error; operators must add `system_agents.verifier.model` explicitly.
- Your Legion's positioning expands from domain-aware multi-agent routing to domain-aware loop orchestration.
- Loop automation stays intentionally decoupled from verification. A loop result is not trusted until trace/doctor evidence shows the expected verifier path.
