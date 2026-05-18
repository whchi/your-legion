# Your Legion Plugin Architecture

`your-legion` is a plugin-owned multi-agent system for OpenCode. Runtime agent definitions live in `src/`, and the plugin injects them into OpenCode at startup.

## Runtime Flow

1. OpenCode loads `your-legion` from the `plugin` array.
2. `src/index.ts` exports the plugin `server` entrypoint.
3. The plugin `config` hook reads `legionaries.yaml` from the active worktree or global OpenCode config directory.
4. `src/config/legionaries.ts` validates `system_agents`, `custom_agents`, and optional reasoning settings.
5. `src/runtime/agent-definition-provider.ts` loads protected system agent factories and YAML custom agents.
6. `src/runtime/domain-packs.ts` resolves enabled global domain packs from convention paths and overrides.
7. `src/runtime/build-agent-config.ts` merges config with agent providers, domain context, and DIO commands.
8. The hook mutates `config.default_agent`, `config.agent`, and `config.command` in place.

There is no markdown frontmatter rewrite step.

## Source Of Truth

- `src/agents/*.ts`: descriptions, modes, permissions, and prompts
- `src/agents/index.ts`: registry of all managed Your Legion agents
- `src/shared/agent-types.ts`: shared names and runtime config types
- `legionaries.yaml`: system/custom provider-model mapping plus optional reasoning settings
- `src/config/legionaries.ts`: YAML loading and validation
- `src/runtime/agent-definition-provider.ts`: system and YAML custom agent provider loading
- `src/runtime/build-agent-config.ts`: final runtime config assembly
- `src/runtime/domain-packs.ts`: convention-first domain pack discovery and Domain Skill Index prompt section
- `src/domains/`: bundled domain packs copied to `dist/domains` at build time
- `src/runtime/dio-loop.ts`: in-memory `/dio` session loop
- `src/index.ts`: plugin entrypoint and config injection hook
- `src/custom-agents/*.yaml`: custom agent definitions
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

## Custom Agent Set

- Custom agents are discovered from `src/custom-agents/*.yaml`.
- Bundled package examples are loaded first; active worktree definitions override bundled examples with the same name.
- A custom agent must have a matching `custom_agents.<name>` model mapping.
- YAML fields: `name`, `description`, `permission`, and `prompt`.
- Custom agents run as `subagent`.
- Any permission key not listed in YAML defaults to `deny`.
- Custom agents cannot use system agent names; system agents are not replaceable.
- `code-reviewer` lives at `src/custom-agents/code-reviewer.yaml` as the bundled real custom-agent example.

## Routing Contract

Your Legion uses direct specialist routing rather than a category-first runtime.

- The `orchestrator` performs turn-local intent classification to choose one concrete subagent.
- These intents are routing heuristics only. They are not runtime categories, model aliases, or execution profiles.
- Multi-step work should go through `planner` first when sequencing is unclear, then `builder` executes approved implementation work.
- `planner`, `builder`, `explorer`, and `librarian` are leaf specialists.
- Leaf specialists should not orchestrate other leaf specialists.
- Code review is command-owned by `/code-review` by default; `code-reviewer` is a custom agent example and not part of the protected system set.
- `legionaries.yaml` configures per-agent models, reasoning, custom-agent enablement, and domain pack enablement. It does not decide which agent gets selected.
- Custom agents are available to the orchestrator when configured and discovered; routing guidance is augmented at runtime with their descriptions.
- `domains` in `legionaries.yaml` enables domain packs. Domain packs add shared task context and namespaced domain skills to the same agents; they do not create new runtime agents.
- Domain skills are read from explicit configured paths in the Domain Skill Index and are intentionally not registered as harness top-level skills.

## Routing Boundaries

- `builder` owns implementation work, including backend, frontend, tests, config, refactors, accessibility, and UI interaction quality.
- `explorer` vs `librarian`: `explorer` owns repo-local discovery and impact tracing; `librarian` owns external documentation, API confirmation, and package behavior lookup.
- `orchestrator` vs `planner`: `orchestrator` handles turn-local routing; `planner` handles decomposition and implementation plans when work needs sequencing.

## Model Mapping

- `legionaries.yaml` defines `system_agents` and `custom_agents`.
- `system_agents` must define all required managed agents.
- `custom_agents` entries are injected only when a matching custom agent file is discovered.
- Every present entry must define `model` using `provider/model-id` format.
- Entries may define `reasoning.effort` as `low`, `medium`, `high`, `xhigh`, or `max`.
- The plugin injects the resolved `model` string into every agent config at startup.
- The plugin passes configured reasoning settings through to `agent.options.reasoning`.
- Different agents may use different providers in the same config.

## Domain Packs

- Domain packs live under `~/.config/opencode/your-legion/domains/<domain-id>/`.
- Bundled domain packs live under `src/domains/<domain-id>/`; global domain packs can extend or override them by id.
- Conventional component folders are `workflows/`, `decisions/`, `examples/`, and `skills/`.
- Enable a conventional domain with `domains.<domain-id>: true`.
- Override or mount specific components with `domains.<domain-id>.<component>.<id>.path`.
- A same-id override replaces the conventional file; `false` disables a conventional component.
- Domain ids and component ids use the same kebab-case style as agent names.

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

1. For a user custom agent, add a YAML file under `src/custom-agents/`.
2. Add the model mapping under `custom_agents` in `legionaries.yaml`.
3. For a new protected system agent, add a module under `src/agents/`, register it in `src/agents/index.ts`, update `src/shared/agent-types.ts`, and add a `system_agents` mapping.
4. Update routing guidance in `src/agents/orchestrator.ts` when the new system agent changes delegation behavior.
5. Update docs in `README.md` and `AGENTS.md` if the topology or routing contract changes.
6. Update tests under `tests/`.

## DIO Command

- `/dio` is a plugin-owned devotio completion loop.
- The loop is in memory per OpenCode session.
- It continues on `session.idle` until `<dio_complete>...</dio_complete>` appears, `/dio-stop` cancels it, or the max-iteration guard is reached.
- DIO state does not persist across OpenCode restarts.

## Verification

- `tests/plugin-runtime.test.js` verifies runtime config assembly and plugin injection.
- `tests/legionaries.test.js` verifies model-map parsing and validation.
- `tests/agent-config.test.js` verifies the expected agent behaviors and permissions survive the migration to `src/agents/`.
