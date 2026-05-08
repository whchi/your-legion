# Development

This document covers repository development for `your-legion`. User-facing installation and configuration instructions live in `README.md`.

## Plugin-First Runtime

- OpenCode loads the published package from the `plugin` array.
- `src/index.ts` registers a server hook that mutates OpenCode config in place.
- `src/config/legionaries.ts` reads and validates `legionaries.yaml`.
- `src/runtime/build-agent-config.ts` merges the per-agent model map with the base agent definitions in `src/agents/`.
- The plugin injects `default_agent` and the full `agent` map at startup.

No frontmatter rewrite step is required.

## File Layout

```text
.
├── src/
│   ├── agents/
│   ├── config/
│   ├── runtime/
│   └── shared/
├── tests/
├── legionaries.yaml
├── opencode.jsonc
├── README.md
├── DEVELOPMENT.md
├── AGENTS.md
└── temp/
```

## Local Development

- Install dependencies with `bun install`.
- Run tests with `node --test tests/*.test.js`.
- Build the published plugin entrypoint with `bun run build`.
- Temporary test artifacts belong under `temp/`, which is gitignored.

## Customization

- Edit `src/agents/*.ts` to change prompts, permissions, descriptions, or modes.
- Edit `legionaries.yaml` to mix providers, update per-agent models, and tune reasoning settings.
- Add a new agent by updating `src/agents/`, `src/agents/index.ts`, `src/shared/agent-types.ts`, `legionaries.yaml`, and the routing guidance in `src/agents/orchestrator.ts` and `src/agents/dispatcher.ts`.

## Routing Contract

Your Legion uses direct specialist routing rather than a category-first runtime.

- The `orchestrator` performs turn-local intent classification to choose one concrete subagent or route through `dispatcher`.
- These intents are routing heuristics only. They are not runtime categories, model aliases, or execution profiles.
- `dispatcher` coordinates multi-step, multi-specialist work and should be used when sequencing or safe parallelism matters.
- `planner`, `builder`, `frontend-developer`, `code-reviewer`, `explorer`, and `librarian` are leaf specialists.
- Leaf specialists should not orchestrate other leaf specialists. Composition should flow through `dispatcher`.
- `legionaries.yaml` configures per-agent models and reasoning only. It does not decide which agent gets selected.

## Routing Boundaries

- `builder` vs `frontend-developer`: `builder` owns non-visual engineering work, tests, config, and refactors; `frontend-developer` owns UI, layout, styling, accessibility, and interaction quality.
- `explorer` vs `librarian`: `explorer` owns repo-local discovery and impact tracing; `librarian` owns external documentation, API confirmation, and package behavior lookup.
- `orchestrator` vs `dispatcher`: `orchestrator` handles single dominant-intent routing; `dispatcher` handles decomposition, sequencing, and parallel specialist coordination.

## Related Docs

- `AGENTS.md`: plugin internals and runtime architecture
- `docs/your-legion/specs/`: design docs
- `docs/your-legion/plans/`: implementation plans
