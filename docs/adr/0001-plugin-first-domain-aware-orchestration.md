# ADR 0001: Plugin-First Domain-Aware Orchestration

## Status

Accepted

## Context

Your Legion exists to improve OpenCode's multi-agent workflow without becoming a separate agent platform.

The project needs a stable architecture direction for four recurring concerns:

- how OpenCode work should be routed across agents;
- how users can bring professional or project-specific knowledge into the system;
- how routing and domain usage can be observed and verified;
- how orchestration cost should be evaluated against native OpenCode execution.

The project should stay lightweight. It should not become a standalone agent operating system, a marketplace, or a broad ecosystem play. OpenCode remains the execution harness; Your Legion contributes agent definitions, routing guidance, domain context, and verification surfaces.

## Decision

Your Legion is an OpenCode plugin that makes multi-agent work domain-aware, observable, and verifiable.

The system keeps a plugin-first architecture:

- OpenCode loads Your Legion through the plugin configuration.
- Runtime agent definitions live in `src/agents/`.
- The plugin injects protected system agents and configured custom agents into OpenCode at startup.
- OpenCode remains responsible for the chat, tool execution, and agent runtime.

Domain Pack is the core abstraction for user expertise:

- `DOMAIN.md` is the routing description and component declaration contract.
- Optional domain components can provide workflows, decisions, examples, and skills.
- Domain Packs are repo-versioned or config-versioned expert knowledge, not harness-level skills.
- Domain descriptions and component paths come from `DOMAIN.md`, not ad hoc prompt text.

Agent roles are intentionally narrow:

- `orchestrator` clarifies intent, selects active domains, delegates to one specialist, and reports back to the user.
- `builder` executes clear work, including repo reading, shell commands, edits, tests, verification, analysis, copy, and code-coupled documentation.
- `explorer` collects known repo or local-file facts when discovery is the requested deliverable.
- `librarian` collects third-party or unknown external documentation when external reference discovery is the requested deliverable.
- `planner` creates implementation plans when sequencing is unclear.

The orchestrator must not inspect the repo or pre-read context for `builder`. When a task is clear execution work, it delegates directly to `builder`; `builder` gathers its own context.

Trace and doctor are part of the architecture contract:

- Delegations record active domains, domain refs, and domain skills.
- Specialists record domain reads.
- Runtime evidence is warn-only.
- `doctor --worktree .` turns static domain declarations and runtime trace evidence into actionable diagnostics and usage stats.
- Scenario diagnostics protect the fixed coding, marketing, finance, accounting, and mixed-domain routing cases.

Benchmarking evaluates orchestration as a quality tradeoff, not only a token-saving tactic:

- The same clean prompt should run through native OpenCode builder and the Your Legion orchestrated path.
- Results should compare completion quality, routing correctness, domain correctness, domain read evidence, and token usage.
- Reports should distinguish outcomes such as "cheaper same quality", "more expensive but better", and "more expensive and not better".

## Consequences

This decision keeps the project focused:

- Documentation should present Your Legion as an OpenCode multi-agent enhancement layer.
- Domain authoring UX matters because Domain Packs are the intended way to add user expertise.
- Tests should protect agent boundaries, especially the orchestrator's no-pre-read boundary.
- Trace/doctor output should be human-actionable, not just raw logs.
- Benchmark results should be allowed to show that orchestration costs more when quality improves enough to justify it.

This decision also creates explicit non-goals:

- Do not build a standalone agent operating system.
- Do not build a public Domain Pack marketplace as part of the near-term architecture.
- Do not build ambassador, growth, or community programs as product architecture.
- Do not optimize for token savings when it damages task completion quality or role clarity.
- Do not add autonomous continuation features mainly to compensate for OpenCode runtime behavior; prefer native OpenCode support for that class of work.
