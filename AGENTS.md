# Your Legion Plugin Architecture

`your-legion` is a plugin-owned multi-agent system for OpenCode. Runtime agent definitions live in `src/`, and the plugin injects them into OpenCode at startup.

## Runtime Flow

1. OpenCode loads `your-legion` from the `plugin` array.
2. `src/index.ts` exports the plugin `server` entrypoint.
3. The plugin `config` hook reads `legionaries.yaml` from the active worktree or global OpenCode config directory.
4. `src/config/legionaries.ts` validates the per-agent model map and optional reasoning settings.
5. `src/runtime/build-agent-config.ts` merges that config with the required agent definitions and any configured optional agent definitions from `src/agents/`.
6. The hook mutates `config.default_agent` and `config.agent` in place.

There is no markdown frontmatter rewrite step.

## Source Of Truth

- `src/agents/*.ts`: descriptions, modes, permissions, and prompts
- `src/agents/index.ts`: registry of all managed Your Legion agents
- `src/shared/agent-types.ts`: shared names and runtime config types
- `legionaries.yaml`: per-agent provider/model mapping plus optional reasoning settings
- `src/config/legionaries.ts`: YAML loading and validation
- `src/runtime/build-agent-config.ts`: final runtime config assembly
- `src/index.ts`: plugin entrypoint and config injection hook
- `temp/`: gitignored local temp artifacts for tests and config experiments

Repo-local `.opencode/agents/*.md` files are intentionally not part of the runtime anymore.

## Agent Set

### `orchestrator`

- Mode: `primary`
- Role: default entry point and intent-based router
- Owns the intent gate and routes work to the right specialist

### `explorer`

- Mode: `subagent`
- Role: read-only codebase discovery specialist
- Read-only leaf with no shell, edits, or delegation

### `librarian`

- Mode: `subagent`
- Role: read-only documentation and API reference specialist
- Read-only leaf focused on external references
- Prefer Context7 MCP for library and framework docs before falling back to web fetch/search

### `planner`

- Mode: `subagent`
- Role: planning specialist for specs and implementation plans
- Runtime-enforced docs-only editor with `edit` limited to `docs/**/*.md`

### `builder`

- Mode: `subagent`
- Role: implementation specialist
- Handles code changes, tests, configuration, verification, and UI/frontend work

## Optional Agent Set

### `code-reviewer`

- Mode: `subagent`
- Role: optional read-only reviewer
- Injected only when `legionaries.yaml` defines `agents.code-reviewer.model`
- Review remains command-owned by `/code-review` by default

## Routing Contract

Your Legion uses direct specialist routing rather than a category-first runtime.

- The `orchestrator` performs turn-local intent classification to choose one concrete subagent.
- These intents are routing heuristics only. They are not runtime categories, model aliases, or execution profiles.
- Multi-step work should go through `planner` first when sequencing is unclear, then `builder` executes approved implementation work.
- `planner`, `builder`, `explorer`, and `librarian` are leaf specialists.
- Leaf specialists should not orchestrate other leaf specialists.
- Code review is command-owned by `/code-review` by default; `code-reviewer` is optional and not part of default routing.
- `legionaries.yaml` configures per-agent models and reasoning only. It does not decide which agent gets selected.

## Routing Boundaries

- `builder` owns implementation work, including backend, frontend, tests, config, refactors, accessibility, and UI interaction quality.
- `explorer` vs `librarian`: `explorer` owns repo-local discovery and impact tracing; `librarian` owns external documentation, API confirmation, and package behavior lookup.
- `orchestrator` vs `planner`: `orchestrator` handles turn-local routing; `planner` handles decomposition and implementation plans when work needs sequencing.

## Model Mapping

- `legionaries.yaml` defines one `agents` map.
- The map must define all required managed agents.
- Optional managed agents are injected only when their entries are present.
- Every present entry must define `model` using `provider/model-id` format.
- Entries may define `reasoning.effort` as `low`, `medium`, `high`, `xhigh`, or `max`.
- The plugin injects the resolved `model` string into every agent config at startup.
- The plugin passes configured reasoning settings through to `agent.options.reasoning`.
- Different agents may use different providers in the same config.

This repo ships an example mixed-provider mapping using `openai`, `github-copilot`, and `opencode-go`.

## Packaging

- Package name: `@whchi/your-legion`
- Published server entry: `./server`
- Build output: `dist/server.js`
- Build command: `bun run build`

OpenCode should be configured like this:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@whchi/your-legion"]
}
```

## Extending The Plugin

1. Add a new agent module under `src/agents/`.
2. Register it in `src/agents/index.ts`.
3. Add the agent name to `src/shared/agent-types.ts`.
4. Add a model mapping for required agents in `legionaries.yaml`; optional agents should be documented but not required in the bundled config.
5. Update routing guidance in `src/agents/orchestrator.ts` when the new agent changes delegation behavior.
6. Update docs in `README.md` and `AGENTS.md` if the topology or routing contract changes.
7. Update tests under `tests/`.

## Verification

- `tests/plugin-runtime.test.js` verifies runtime config assembly and plugin injection.
- `tests/legionaries.test.js` verifies model-map parsing and validation.
- `tests/agent-config.test.js` verifies the expected agent behaviors and permissions survive the migration to `src/agents/`.
