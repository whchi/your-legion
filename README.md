# your-legion

`your-legion` is a plugin-first OpenCode multi-agent system inspired by [`oh-my-openagent`](https://github.com/code-yeongyu/oh-my-openagent).

The plugin owns one primary orchestrator, one workflow coordinator, and six leaf specialists. It injects them into OpenCode at startup from `agent-providers.yaml`.

## Agent Set

- `orchestrator`: default primary router
- `dispatcher`: multi-track workflow coordinator
- `planner`: design doc and implementation plan writer
- `builder`: non-visual execution specialist
- `frontend-developer`: UI and interaction specialist
- `code-reviewer`: read-only reviewer
- `explorer`: read-only codebase discovery specialist
- `librarian`: read-only documentation and API reference specialist

## Routing Model

Your Legion uses direct specialist routing.

- The `orchestrator` classifies the turn into one dominant intent and chooses a concrete subagent.
- Those intents are routing heuristics, not runtime categories or model profiles.
- The `dispatcher` is only used when work needs sequencing, decomposition, or parallel coordination across multiple specialists.
- `planner`, `builder`, `frontend-developer`, `code-reviewer`, `explorer`, and `librarian` are leaf specialists.
- `agent-providers.yaml` controls model and reasoning settings per agent. It does not control routing.

## Common Boundaries

- `builder` vs `frontend-developer`: use `builder` for non-visual code changes, tests, refactors, config, and backend logic; use `frontend-developer` for UI, layout, styling, accessibility, and client-side interaction work.
- `explorer` vs `librarian`: use `explorer` for repo-local discovery and impact analysis; use `librarian` for external docs, API references, and package behavior lookup.

## Plugin-First Runtime

- OpenCode loads `your-legion` from the `plugin` array.
- `src/index.ts` registers a server hook that mutates OpenCode config in place.
- `src/config/agent-providers.ts` reads and validates `agent-providers.yaml`.
- `src/runtime/build-agent-config.ts` merges the per-agent model map with the base agent definitions in `src/agents/`.
- The plugin injects `default_agent` and the full `agent` map at startup.
- Restart OpenCode after changing `agent-providers.yaml` or rebuilding the plugin.

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
├── agent-providers.yaml
├── opencode.jsonc
├── README.md
├── AGENTS.md
└── temp/
```

## Usage

1. Install dependencies with `bun install`.
2. Build the plugin with `bun run build`.
3. Configure OpenCode to load the plugin:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["your-legion"]
}
```

4. Define the per-agent model map in `agent-providers.yaml`.
5. Restart OpenCode.

## Model Configuration

`agent-providers.yaml` is the source of truth for per-agent model assignments and optional reasoning settings.

```yaml
agents:
  orchestrator:
    model: openai/gpt-5.5
    reasoning:
      effort: high
  dispatcher:
    model: github-copilot/claude-sonnet-4
  explorer:
    model: opencode-go/deepseek-v4-flash
  librarian:
    model: opencode-go/qwen3.6-plus
  planner:
    model: openai/gpt-5.4
  builder:
    model: github-copilot/claude-sonnet-4
  frontend-developer:
    model: github-copilot/gemini-3.1-pro-preview
  code-reviewer:
    model: openai/gpt-5.5
```

The loader validates that:

- every managed agent has a model mapping
- every model matches `provider/model-id`
- different agents may use different providers in the same file
- `reasoning.effort` must be one of `low`, `medium`, `high`, `xhigh`, or `max` when present

The plugin passes reasoning settings through to `agent.options.reasoning`.

This repo's default example mixes `openai`, `github-copilot`, and `opencode-go`.

## Development

- Run tests with `node --test tests/*.test.js`.
- Build the published plugin entrypoint with `bun run build`.
- Temporary test artifacts belong under `temp/`, which is gitignored.

## Customization

- Edit `src/agents/*.ts` to change prompts, permissions, descriptions, or modes.
- Edit `agent-providers.yaml` to mix providers, update per-agent models, and tune reasoning settings.
- Add a new agent by updating `src/agents/`, `src/agents/index.ts`, `src/shared/agent-types.ts`, `agent-providers.yaml`, and the routing guidance in `src/agents/orchestrator.ts` and `src/agents/dispatcher.ts`.

## Related Docs

- `AGENTS.md`: plugin internals and runtime architecture
- `docs/your-legion/specs/`: design docs
- `docs/your-legion/plans/`: implementation plans
