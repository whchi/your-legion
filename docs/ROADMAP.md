# Your Legion Roadmap

This document tracks the current product plan and implementation status for Your Legion.

The architecture decisions behind this roadmap are recorded in [ADR 0001: Plugin-First Domain-Aware Orchestration](./adr/0001-plugin-first-domain-aware-orchestration.md) and [ADR 0002: Legion Loop Contract](./adr/0002-legion-loop-contract.md).

## Current Focus

Your Legion makes OpenCode's multi-agent workflow domain-aware, loop-aware, observable, and verifiable, while giving users a lightweight way to bring expert knowledge and recurring engineering loops into a project.

The near-term work should strengthen this loop:

1. author domain knowledge and loop contracts;
2. route to the right specialist with explicit `Loop:` and domain evidence;
3. keep maker/checker separation through `builder` and `verifier`;
4. verify the specialist used the right knowledge and loop state;
5. compare the result against native OpenCode.

## Development Plan

### 1. Documentation Repositioning

Goal: make the public docs say exactly what Your Legion is for.

Acceptance criteria:

- A new user can understand the project in under one minute.
- Docs clearly distinguish Your Legion from OpenCode itself.
- Docs do not suggest marketplace or ecosystem work as a current goal.

### 2. Domain Pack Authoring UX

Goal: make it easy for users to add their own expert knowledge.

Acceptance criteria:

- A user can create a useful custom domain pack without reading runtime source code.
- `DOMAIN.md` remains the only routing description and component declaration contract.
- Empty placeholder structures are not encouraged.

### 3. Routing Contract Hardening

Goal: make the agent boundaries stable and testable.

Acceptance criteria:

- Routing tests protect the current role model.
- No task class requires `orchestrator` to inspect repo files before selecting a specialist.
- Domain selection is represented as task-local responsibility, not a global mode switch.

### 4. Trace Evidence

Goal: every meaningful delegation should leave evidence that can be checked later.

Acceptance criteria:

- For a completed task, users can answer which agent handled the task.
- Users can see which domains were active.
- Users can see which refs or skills were declared.
- Users can see which declared refs or skills were actually read.
- Users can see which warnings need attention.

### 5. Doctor And Verification

Goal: turn trace evidence into actionable diagnostics and usage stats.

Acceptance criteria:

- `doctor` catches missing declared domain files.
- `doctor` catches declared domain refs or skills that were not read.
- `doctor` reports domain usage stats from runtime trace evidence.
- `doctor --scenarios` validates the fixed coding, marketing, finance, accounting, and mixed-domain cases.
- Doctor failures are understandable without reading implementation code.

### 6. Native Vs Orchestrated Benchmark

Goal: verify whether Your Legion improves OpenCode work quality enough to justify orchestration cost.

Acceptance criteria:

- Each benchmark task records expected agent, expected domains, actual agent path, domain evidence, completion score, and token totals.
- Results can distinguish "more expensive but better" from "more expensive and not better."
- Benchmark documentation contains only the latest clean run unless older results are explicitly kept for historical comparison.

### 7. Legion Loop Contract

Goal: make Loop Engineering a first-class, diagnosable Your Legion workflow without owning a scheduler yet.

Acceptance criteria:

- `legionaries.yaml` can define loops with objective, trigger, inbox, agents, domain evidence, worktree policy, verification, and connector mode.
- `verifier` is a protected system agent for maker/checker separation.
- Task Context Envelopes include `Loop:`.
- `doctor` validates loop catalog health and loop runtime evidence.
- `create-loop`, `loop-presets`, `loop-prompt`, `loop-runs`, and `loops` expose the workflow from the CLI.

## Planning Backlog

| Area | Item | Priority | Notes |
| --- | --- | --- | --- |
| Docs | Rewrite README intro around OpenCode multi-agent enhancement | P0 | Done: README now frames Your Legion as an OpenCode multi-agent/domain/trace/doctor layer |
| Docs | Add "When to use Your Legion" section | P0 | Done: README includes concrete use cases and non-goals |
| Domain Pack | Improve generated `DOMAIN.md` template | P0 | Done: `create-domain` generates routing and component-catalog guidance |
| Domain Pack | Add authoring guide | P1 | Done: `docs/DOMAIN_PACK_AUTHORING.md` covers semantic routing, optional facets, and verification |
| Routing | Preserve orchestrator boundary tests | P0 | Done: agent tests protect no pre-reading, no direct execution, and leaf specialist boundaries |
| Routing | Add unclear-intent clarification test | P1 | Done: orchestrator must ask before delegation when it cannot choose one specialist |
| Trace | Clarify warning categories | P1 | Done: trace diagnostics include stable category labels such as `[unknown-domain-skill]` |
| Doctor | Improve failure messages and usage stats | P1 | Done: `doctor` prints summary counts, next steps, category-aware guidance, and domain usage stats |
| Benchmark | Keep clean native vs orchestrated task set | P0 | Done: benchmark doc keeps the fixed four-domain prompt set and clean-run rules |
| Benchmark | Add summary table for quality plus token cost | P1 | Done: benchmark summaries include task `outcome` and `byOutcome` aggregation |
| Loop | Add Legion Loop contract and verifier | P0 | Done: loops are config-backed, prompt-injected, trace-aware, and doctor-validated |

## Implementation Status

The current product slice is implemented for domain-aware orchestration and Legion Loop DX:

- Public positioning now says Your Legion is an OpenCode multi-agent enhancement layer, not a standalone platform or ecosystem.
- Domain authoring has a generated `DOMAIN.md` guide, a dedicated authoring document, success-output next steps, corrected custom-domain examples, and doctor-based diagnostics guidance.
- Routing boundaries are covered by tests for orchestrator tool limits, builder execution ownership, explorer/librarian discovery boundaries, Task Context Envelope shape, no domain pre-reading, and unclear-intent clarification.
- Trace/doctor output now supports categorized runtime diagnostics, usage stats, summary counts, actionable next steps, and scenario validation.
- Benchmark reporting now compares native builder with the full orchestrated path and reports quality-plus-token outcomes instead of token deltas alone.
- Legion Loop support adds `verifier`, `Loop:` envelope parsing, loop config validation, loop catalog injection, loop trace evidence, loop doctor sections, quick-start presets, generated loop prompts, run ledgers, `create-loop`, and `loops`.

Current verification commands:

```bash
bun test
bun run build
git diff --check
```

All three must pass before considering this plan slice complete.

## Deferred Ideas

These may become useful later, but should not drive the current roadmap:

- GitHub Action or PR comment integration.
- Domain Pack sharing repositories.
- UI or editor extension.
- Public marketplace.
- Community growth programs.
