# Configuration

Your Legion reads per-agent model and reasoning settings from `legionaries.yaml` at startup. The plugin injects required agents and any configured optional agents into OpenCode automatically.

## File Location

Place `legionaries.yaml` in one of these locations (checked in order):

- `<worktree-root>/legionaries.yaml`
- `<opencode-config-dir>/legionaries.yaml`

## Schema

The file has a single top-level `agents` map. Every required managed agent must have an entry. Optional agents are injected only when their entries are present.

```yaml
agents:
  <agent-name>:
    model: <provider>/<model-id>
    reasoning:
      effort: <low|medium|high|xhigh|max>
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `agents.<name>.model` | yes for required agents, yes when an optional agent is present | Provider and model ID in `provider/model-id` format |
| `agents.<name>.reasoning.effort` | no | Reasoning effort level for supported providers |

### Reasoning Effort

Optional values: `low`, `medium`, `high`, `xhigh`, `max`.
Only takes effect when the agent's provider supports reasoning effort.

## Example

This is the bundled example `legionaries.yaml`:

```yaml
agents:
  orchestrator:
    model: openai/gpt-5.5
    reasoning:
      effort: medium
  explorer:
    model: opencode-go/deepseek-v4-flash
    reasoning:
      effort: max
  librarian:
    model: opencode-go/minimax-m2.7
  planner:
    model: openai/gpt-5.5
    reasoning:
      effort: high
  builder:
    model: opencode-go/kimi-k2.6
```

### Optional Code Reviewer

`code-reviewer` is not required by the bundled config because code review is owned by the `/code-review` command by default. Add it only when you want a runtime read-only reviewer available for explicit advanced workflows.

```yaml
agents:
  # Add this alongside the required agent mappings.
  code-reviewer:
    model: openai/gpt-5.5
    reasoning:
      effort: high
```

## Agent Descriptions

| Agent | Role |
|-------|------|
| `orchestrator` | Default primary router. Performs intent classification and routes each turn to the right specialist. |
| `explorer` | Read-only codebase discovery specialist. No shell, edits, or delegation. |
| `librarian` | Read-only documentation and API reference specialist. Prefers Context7 MCP for library and framework docs. |
| `planner` | Planning specialist for specs and implementation plans. |
| `builder` | Implementation specialist. Handles code changes, tests, configuration, verification, and UI/frontend work. |
| `code-reviewer` | Optional read-only reviewer. Injected only when configured. |

## Routing Notes

- `legionaries.yaml` controls **model and reasoning settings** per agent. It does **not** control routing.
- Different agents may use different providers in the same config.
- Model values must use `provider/model-id` format.
- Code review is handled by the `/code-review` command by default, so `code-reviewer` does not require a `legionaries.yaml` agent mapping.
