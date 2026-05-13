# Configuration

Your Legion reads per-agent model and reasoning settings from `legionaries.yaml` at startup. The plugin injects required system agents, configured optional system agents, and configured custom agents into OpenCode automatically.

## File Location

Place `legionaries.yaml` in one of these locations (checked in order):

- `<worktree-root>/legionaries.yaml`
- `<opencode-config-dir>/legionaries.yaml`

## Schema

The file has two top-level maps. Every required system agent must have an entry in `system_agents`. Optional system agents are injected only when their entries are present. Custom agents are enabled through `custom_agents` and must have a matching TypeScript file in a custom-agent discovery directory.

```yaml
system_agents:
  <agent-name>:
    model: <provider>/<model-id>
    reasoning:
      effort: <low|medium|high|xhigh|max>
custom_agents:
  <custom-agent-name>:
    model: <provider>/<model-id>
    reasoning:
      effort: <low|medium|high|xhigh|max>
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `system_agents.<name>.model` | yes for required system agents, yes when an optional system agent is present | Provider and model ID in `provider/model-id` format |
| `system_agents.<name>.reasoning.effort` | no | Reasoning effort level for supported providers |
| `custom_agents.<name>.model` | yes when a custom agent is present | Provider and model ID in `provider/model-id` format |
| `custom_agents.<name>.reasoning.effort` | no | Reasoning effort level for supported providers |

### Reasoning Effort

Optional values: `low`, `medium`, `high`, `xhigh`, `max`.
Only takes effect when the agent's provider supports reasoning effort.

## Example

This is the bundled example `legionaries.yaml`:

```yaml
system_agents:
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
custom_agents: {}
```

### Optional Code Reviewer

`code-reviewer` is not required by the bundled config because code review is owned by the `/code-review` command by default. Add it only when you want a runtime read-only reviewer available for explicit advanced workflows.

```yaml
system_agents:
  # Add this alongside the required agent mappings.
  code-reviewer:
    model: openai/gpt-5.5
    reasoning:
      effort: high
```

## Custom Agents

Place custom agent factory files in one of these directories:

- Global: `~/.config/opencode/your-legion/agents/*.ts`
- Project: `.opencode/your-legion/agents/*.ts`

Project files override global files with the same filename. The filename without `.ts` is the agent name, and that name must match a `custom_agents` entry.

```typescript
const MODE = 'subagent' as const

export default function createScribeAgent(_model: string) {
  return {
    description: 'Writes release notes and changelogs',
    mode: MODE,
    permission: {
      read: 'allow',
      edit: 'deny',
      bash: 'deny',
      task: 'deny',
    },
    prompt: '# Scribe\n\nWrite concise release notes from repository context.',
  }
}
createScribeAgent.mode = MODE
```

```yaml
custom_agents:
  scribe:
    model: openai/gpt-5.5
    reasoning:
      effort: low
```

Custom agents cannot use system agent names such as `builder`, `planner`, or `explorer`.

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

- `legionaries.yaml` controls **model and reasoning settings** per agent and enables custom agents. It does **not** decide primary system routing.
- Different agents may use different providers in the same config.
- Model values must use `provider/model-id` format.
- Code review is handled by the `/code-review` command by default, so `code-reviewer` does not require a `legionaries.yaml` agent mapping.

## DIO Command

Your Legion injects `/dio` and `/dio-stop` into OpenCode:

- `/dio <objective>` starts an in-memory devotio completion loop for the current session.
- The loop continues on `session.idle` until `<dio_complete>...</dio_complete>` appears, `/dio-stop` is run, or the iteration guard is reached.
- DIO state is not persisted across OpenCode restarts.
