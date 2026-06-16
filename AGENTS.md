# Your Legion Plugin Architecture

`your-legion` is a plugin-owned multi-agent and loop orchestration system for OpenCode. Runtime agent definitions live in `src/`, and the plugin injects them into OpenCode at startup.

## Runtime Flow

1. OpenCode loads `your-legion` from the `plugin` array.
2. `src/index.ts` exports the plugin `server` entrypoint.
3. The plugin `config` hook reads global `legionaries.yaml` from the OpenCode config directory unless an explicit config path is provided.
4. `src/config/legionaries.ts` validates `system_agents`, `custom_agents`, `domains`, `loops`, and optional reasoning settings.
5. `src/runtime/agent-definition-provider.ts` loads protected system agent factories and YAML custom agents.
6. `src/runtime/domain-packs.ts` resolves enabled domain packs from `DOMAIN.md` declarations and same-id overrides.
7. `src/runtime/loop-catalog.ts` formats configured Legion Loops into the Loop Catalog.
8. `src/runtime/build-agent-config.ts` merges config with agent providers, the domain index, and the loop index.
8. The hook mutates `config.default_agent` and `config.agent` in place.

There is no markdown frontmatter rewrite step.

## Source Of Truth

- `src/agents/*.ts`: descriptions, modes, permissions, and prompts
- `src/agents/index.ts`: registry of all managed Your Legion agents
- `src/shared/agent-types.ts`: shared names and runtime config types
- global `legionaries.yaml`: system/custom provider-model mapping, reasoning settings, enabled domain packs, and configured loops
- `src/config/legionaries.ts`: YAML loading and validation
- `src/runtime/agent-definition-provider.ts`: system and YAML custom agent provider loading
- `src/runtime/build-agent-config.ts`: final runtime config assembly
- `src/runtime/domain-packs.ts`: `DOMAIN.md`-declared domain pack discovery and Domain Catalog prompt section
- `src/runtime/loop-catalog.ts`: Legion Loop prompt section formatting
- `src/runtime/domain-usage-contract.ts`: Task Context Envelope parsing, warn-only domain validation, and JSONL trace evidence
- `docs/academic-papers-summary.md`: paper references and claim boundaries behind domain routing and runtime evidence
- `docs/adr/0001-plugin-first-domain-aware-orchestration.md`: accepted architecture direction for plugin-first, domain-aware orchestration
- `docs/ROADMAP.md`: current product plan for the OpenCode multi-agent, Legion Loop, Domain Pack, trace/doctor, and benchmark roadmap
- `docs/LEGION_LOOPS.md`: user-facing Legion Loop guide
- `docs/DOMAIN_PACK_AUTHORING.md`: user-facing Domain Pack authoring guide
- `src/domains/`: bundled domain packs copied to `dist/domains` at build time
- `src/index.ts`: plugin entrypoint and config injection hook
- `src/custom-agents/*.yaml`: custom agent definitions
- `temp/`: gitignored local temp artifacts for tests and config experiments

Repo-local `.opencode/agents/*.md` files are intentionally not part of the runtime anymore.

## Agent Set

### `orchestrator`

- Mode: `primary`
- Role: default entry point and intent-based router
- Owns intent clarification, delegation, and final reporting
- Does not explore repo/local files or pre-read context for `builder`

### `explorer`

- Mode: `subagent`
- Role: read-only known repo/local-file discovery specialist
- Read-only leaf with no shell, edits, or delegation
- Uses local search/read tools to collect facts when discovery is the requested deliverable

### `librarian`

- Mode: `subagent`
- Role: read-only third-party documentation and API reference specialist
- Read-only leaf focused on external references unknown outside the current repo
- Prefer Context7 MCP for library and framework docs before falling back to web fetch/search

### `planner`

- Mode: `subagent`
- Role: planning specialist for specs and implementation plans
- Runtime-enforced docs-only editor with `edit` limited to `docs/**/*.md`

### `builder`

- Mode: `subagent`
- Role: execution specialist
- Handles approved execution work, including code changes, tests, configuration, verification, UI/frontend work, analysis, copy, structured reviews, and code-coupled documentation

### `verifier`

- Mode: `subagent`
- Role: read-only checker for maker/checker separation and loop completion claims
- Reviews diffs, tests, loop evidence, domain evidence, and verification claims
- Does not edit files or delegate

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

- The `orchestrator` performs turn-local intent clarification to choose one concrete subagent.
- The `orchestrator` asks the user for missing intent details when needed; it does not inspect repo files to make execution context for another agent.
- These intents are routing heuristics only. They are not runtime categories, model aliases, or execution profiles.
- Multi-step work should go through `planner` first when sequencing is unclear, then `builder` executes approved work.
- Loop completion or maker-output verification should go to `verifier`.
- Clear execution work goes directly to `builder`; `builder` gathers any needed repo context, runs commands, edits, and verifies.
- `planner`, `builder`, `verifier`, `explorer`, and `librarian` are leaf specialists.
- Leaf specialists should not orchestrate other leaf specialists.
- Code review is command-owned by `/code-review` by default; `code-reviewer` is a custom agent example and not part of the protected system set.
- Global `legionaries.yaml` configures per-agent models, reasoning, custom-agent enablement, and domain pack enablement. It does not decide which agent gets selected.
- Custom agents are available to the orchestrator when configured and discovered; routing guidance is augmented at runtime with their descriptions.
- `domains` in global `legionaries.yaml` enables domain packs. Domain packs add a shared domain index and namespaced domain skills to the same agents; they do not create new runtime agents.
- `loops` in global `legionaries.yaml` configures Legion Loops. Loops add a shared Loop Catalog and do not create runtime agents.
- The orchestrator activates loop and domain context per delegation with a compact Task Context Envelope. Enabled domains are an index; `Active domains` marks the task-local responsibilities. Matching loops are passed as `Loop: <loop-id>`.
- Domain descriptions and component paths come only from `DOMAIN.md`.
- Routing agents pass relevant `Domain refs` and `Domain skills` in the Task Context Envelope; target specialists read the explicit configured paths from the Domain Catalog.
- Domain skills are intentionally not registered as harness top-level skills.
- No configured domain and no matching domain description both fall back to no-domain delegation: `Active domains: none`, `Domain refs: none`, `Domain skills: none`.
- Domain usage is observable through warn-only trace events under `~/.config/opencode/your-legion/traces/`.
- Loop usage is observable through the same trace events via `loopID`, and `doctor` reports loop catalog, runtime, and scenario diagnostics.

## Routing Boundaries

- `builder` owns execution work, including backend, frontend, tests, config, refactors, accessibility, UI interaction quality, concise analysis, copy, structured reviews, and code-coupled documentation.
- `verifier` owns independent completion review for loop results, maker output, diffs, tests, and evidence claims.
- `explorer` owns requested discovery over known repo or local files; it is not a context pre-reader for `builder`.
- `librarian` owns requested discovery over third-party documentation, API confirmation, package behavior, and version-specific external references.
- `orchestrator` vs `planner`: `orchestrator` handles turn-local routing; `planner` handles decomposition and implementation plans when work needs sequencing.

## Model Mapping

- Global `legionaries.yaml` defines `system_agents`, `custom_agents`, enabled `domains`, and configured `loops`.
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
- `DOMAIN.md` is the description-driven routing contract. Resolution order is global `DOMAIN.md`, then bundled `DOMAIN.md`; if neither exists, the domain is omitted from the Domain Catalog.
- Optional component folders are `workflows/`, `decisions/`, `examples/`, and `skills/`; create only folders with real domain knowledge and list domain-root relative paths in `DOMAIN.md`.
- Enable a domain with `domains.<domain-id>: true`.
- Override or disable specific declared components with `domains.<domain-id>.<component>.<id>.path` or `false`.
- A same-id override replaces the declared file path; overrides do not add components that are absent from `DOMAIN.md`.
- Domain ids and component ids use the same kebab-case style as agent names.
- `bunx @whchi/your-legion create-domain <domain-id>` creates `DOMAIN.md` only for a new custom id; pass `--components decisions,skills` to scaffold selected facets, and `--enable` to write it into `legionaries.yaml`. It must reject existing global domains and bundled domain ids.
- Runtime evidence records `delegation` and `domain-read` events. Use `bunx @whchi/your-legion doctor --worktree .` for diagnostics; it fails when `DOMAIN.md` declarations are invalid or declared domain refs/skills were not read, and it reports domain usage stats.
- Use `bunx @whchi/your-legion domain-scenarios` and `bunx @whchi/your-legion doctor --worktree . --scenarios` for the fixed coding, marketing, finance, accounting, and mixed-domain validation set.

## Legion Loops

- Legion Loops live under `loops` in global `legionaries.yaml`.
- A loop defines `description`, `objective`, `trigger`, `inbox_path`, optional domain evidence, agent roles, worktree policy, verification, and connector mode.
- `inbox_path` must be repo-relative and points to the durable human-readable loop state file.
- `builder` is the default maker and `verifier` is the default checker.
- `create-loop <loop-id> --preset <id>` writes a loop config entry and creates `docs/legion-loops/<loop-id>.md` in the selected worktree.
- `loop-presets`, `loop-prompt`, and `loop-runs` are the user-facing loop DX path.
- `loops` lists configured loops.
- Scheduling and external connectors are declared as loop metadata; execution is still started by OpenCode, CI, cron, hooks, or external tooling.

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

## Verification

- `tests/plugin-runtime.test.ts` verifies runtime config assembly and plugin injection.
- `tests/legionaries.test.ts` verifies model-map parsing and validation.
- `tests/agent-config.test.ts` verifies the expected agent behaviors and permissions survive the migration to `src/agents/`.
- `tests/doctor.test.ts` verifies loop catalog, loop runtime evidence, CLI loop creation, and loop scenario diagnostics.
