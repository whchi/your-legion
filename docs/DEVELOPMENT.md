# Development

This document covers repository development for `your-legion`. User-facing installation and configuration instructions live in [README.md]('../README.md').

## Plugin-First Runtime

- OpenCode loads the published package from the `plugin` array.
- `src/index.ts` registers a server hook that mutates OpenCode config in place.
- `src/config/legionaries.ts` reads and validates `legionaries.yaml`.
- `src/runtime/agent-definition-provider.ts` loads protected system agent factories and discovered custom agent factories.
- `src/runtime/build-agent-config.ts` merges model maps with agent providers and injects `/dio` commands.
- `src/runtime/dio-loop.ts` owns the in-memory DIO session loop.
- The plugin injects `default_agent`, the full `agent` map, and plugin commands at startup.

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
├── docs/
├── AGENTS.md
└── temp/
```

## Local Development

- Install dependencies with `bun install`.
- Run tests with `node --test tests/*.test.js`.
- Build the published plugin entrypoint with `bun run build`.
- Temporary test artifacts belong under `temp/`, which is gitignored.

## Customization

- Edit `src/agents/*.ts` to change system prompts, permissions, descriptions, or modes.
- Edit `legionaries.yaml` to mix providers, update per-agent models, tune reasoning settings, and enable custom agents.
- Add custom agents under `.opencode/your-legion/agents/*.ts` or `~/.config/opencode/your-legion/agents/*.ts`, then add a matching `custom_agents` mapping.
- Add a new required agent by updating `src/agents/`, `src/agents/index.ts`, `src/shared/agent-types.ts`, `legionaries.yaml`, and the routing guidance in `src/agents/orchestrator.ts`.
- Add a new optional agent by registering it in `src/shared/agent-types.ts` and `src/agents/index.ts`, then documenting the optional `legionaries.yaml` mapping.
- Do not use a system agent name for a custom agent. The runtime fails startup if a custom agent attempts to replace a system agent.

## Routing Contract

Your Legion uses direct specialist routing rather than a category-first runtime.

- The `orchestrator` performs turn-local intent classification to choose one concrete subagent.
- These intents are routing heuristics only. They are not runtime categories, model aliases, or execution profiles.
- Multi-step work should go through `planner` first when sequencing is unclear, then `builder` executes approved implementation work.
- `planner`, `builder`, `explorer`, and `librarian` are leaf specialists.
- Leaf specialists should not orchestrate other leaf specialists.
- `planner` is runtime-limited to `docs/**/*.md` edits; code changes belong to `builder`.
- Code review is command-owned by `/code-review` by default; `code-reviewer` is an optional runtime agent when explicitly configured.
- `legionaries.yaml` configures per-agent models, reasoning, and custom-agent enablement. It does not decide which system agent gets selected.

## Routing Boundaries

- `builder` owns implementation work, including backend, frontend, tests, config, refactors, accessibility, and UI interaction quality.
- `explorer` vs `librarian`: `explorer` owns repo-local discovery and impact tracing; `librarian` owns external documentation, API confirmation, and package behavior lookup.
- `orchestrator` vs `planner`: `orchestrator` handles turn-local routing; `planner` handles decomposition and implementation plans when work needs sequencing.

## Related Docs

- `AGENTS.md`: plugin internals and runtime architecture
- `docs/your-legion/custom-agents-and-dio.md`: custom agent and DIO implementation reference
