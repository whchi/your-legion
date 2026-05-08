# Configuration

Your Legion reads per-agent model and reasoning settings from `legionaries.yaml` at startup. The plugin injects these into each agent's runtime config automatically.

## File Location

Place `legionaries.yaml` in one of these locations (checked in order):

- `<worktree-root>/legionaries.yaml`
- `<opencode-config-dir>/legionaries.yaml`

## Schema

The file has a single top-level `agents` map. Every managed agent must have an entry.

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
| `agents.<name>.model` | yes | Provider and model ID in `provider/model-id` format |
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
  dispatcher:
    model: opencode-go/glm-5.1
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
  frontend-developer:
    model: github-copilot/gemini-3.1-pro-preview
  code-reviewer:
    model: openai/gpt-5.5
    reasoning:
      effort: high
```

## Agent Descriptions

| Agent | Role |
|-------|------|
| `orchestrator` | Default primary router. Performs intent classification and routes each turn to the right specialist. |
| `dispatcher` | Multi-track workflow coordinator. Decides sequential vs parallel specialist execution for complex tasks. |
| `explorer` | Read-only codebase discovery specialist. No shell, edits, or delegation. |
| `librarian` | Read-only documentation and API reference specialist. Focused on external references. |
| `planner` | Planning specialist for specs and implementation plans. |
| `builder` | Non-visual execution specialist. Handles code changes, tests, configuration, and verification. |
| `frontend-developer` | Frontend implementation specialist. Handles UI, layout, styling, accessibility, and interaction quality. |
| `code-reviewer` | Read-only reviewer. Limited to read-only inspection plus selected git commands. |

## Routing Notes

- `legionaries.yaml` controls **model and reasoning settings** per agent. It does **not** control routing.
- Different agents may use different providers in the same config.
- Model values must use `provider/model-id` format.
