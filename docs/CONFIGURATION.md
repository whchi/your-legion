# Configuration

Your Legion reads per-agent model and reasoning settings from `legionaries.yaml` at startup. The plugin injects required system agents and configured YAML custom agents into OpenCode automatically.

## File Location

Place `legionaries.yaml` in one of these locations (checked in order):

- `<worktree-root>/legionaries.yaml`
- `<opencode-config-dir>/legionaries.yaml`

## Schema

The file has two top-level maps. Every required system agent must have an entry in `system_agents`. Custom agents are enabled through `custom_agents` and must have a matching YAML file under `src/custom-agents/`.

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
If you want to disable custom_agents just set `custom_agents: {}` or comment-out whole block

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

`code-reviewer` is bundled as a real custom-agent example in [`code-reviewer.yaml`](../src/custom-agents/code-reviewer.yaml). The bundled `legionaries.yaml` enables it like this:

```yaml
custom_agents:
  code-reviewer:
    model: openai/gpt-5.5
    reasoning:
      effort: high
```

## Custom Agents

Place custom agent YAML files in:

- `src/custom-agents/*.yaml`

The filename without `.yaml` is the discovered agent key. The file's `name` must match that key and the `custom_agents` entry.

```yaml
name: scribe
description: Writes release notes and changelogs
permission:
  read: allow
  glob: allow
  grep: allow
  edit: deny
  bash: deny
  task: deny
prompt: |-
  # Scribe

  Write concise release notes from repository context.
```

```yaml
custom_agents:
  scribe:
    model: openai/gpt-5.5
    reasoning:
      effort: low
```

Custom agents run as `subagent`. Any permission key not listed in the YAML is set to `deny`. Custom agents cannot use system agent names such as `builder`, `planner`, or `explorer`.

## Agent Descriptions

| Agent | Role |
|-------|------|
| `orchestrator` | Default primary router. Performs intent classification and routes each turn to the right specialist. |
| `explorer` | Read-only codebase discovery specialist. No shell, edits, or delegation. |
| `librarian` | Read-only documentation and API reference specialist. Prefers Context7 MCP for library and framework docs. |
| `planner` | Planning specialist for specs and implementation plans. |
| `builder` | Implementation specialist. Handles code changes, tests, configuration, verification, and UI/frontend work. |
| `code-reviewer` | Bundled YAML custom agent for read-only review. |

## Routing Notes

- `legionaries.yaml` controls **model and reasoning settings** per agent and enables custom agents. It does **not** decide primary system routing.
- Different agents may use different providers in the same config.
- Model values must use `provider/model-id` format.
- Code review is handled by the `/code-review` command by default; the bundled `code-reviewer` custom agent is enabled in `legionaries.yaml` as an example.

## DIO Command

Your Legion injects `/dio` and `/dio-stop` into OpenCode:

- `/dio <objective>` starts an in-memory devotio completion loop for the current session.
- The loop continues on `session.idle` until `<dio_complete>...</dio_complete>` appears, `/dio-stop` is run, or the iteration guard is reached.
- DIO state is not persisted across OpenCode restarts.
