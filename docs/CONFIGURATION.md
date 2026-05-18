# Configuration

Your Legion reads per-agent model, reasoning settings, and enabled domain packs from `legionaries.yaml` at startup. The plugin injects required system agents, configured YAML custom agents, and a Domain Skill Index into OpenCode automatically.

## File Location

Place `legionaries.yaml` in one of these locations (checked in order):

- `<worktree-root>/legionaries.yaml`
- `<opencode-config-dir>/legionaries.yaml`

## Schema

The file has three top-level maps. Every required system agent must have an entry in `system_agents`. Custom agents are enabled through `custom_agents` and must have a matching YAML file under `src/custom-agents/`. Domain packs are enabled through `domains`.

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
domains:
  <domain-id>: true
```
If you want to disable custom_agents just set `custom_agents: {}` or comment-out whole block

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `system_agents.<name>.model` | yes for required system agents, yes when an optional system agent is present | Provider and model ID in `provider/model-id` format |
| `system_agents.<name>.reasoning.effort` | no | Reasoning effort level for supported providers |
| `custom_agents.<name>.model` | yes when a custom agent is present | Provider and model ID in `provider/model-id` format |
| `custom_agents.<name>.reasoning.effort` | no | Reasoning effort level for supported providers |
| `domains.<id>` | no | Enables a global convention-first domain pack or declares path overrides |

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
domains:
  coding: true
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

## Domain Packs

Domain packs provide shared task context for the same system and custom agents. They are for domain memory, reusable workflows, decisions, examples, and domain-local skills. They are not registered as harness-level skills.

Your Legion ships a bundled `coding` domain and enables it in the example `legionaries.yaml`. It includes:

- `coding/implementation-loop`
- `coding/engineering-guardrails`
- `coding/change-report`
- `coding/make-code-change`

After installation, global domain pack files live under:

```text
~/.config/opencode/your-legion/domains/
└── <domain-id>/
    ├── workflows/
    ├── decisions/
    ├── examples/
    └── skills/
```

Enable a domain that follows this convention with:

```yaml
domains:
  coding: true
  marketing: true
  financial-analytics: true
```

For `marketing: true`, Your Legion automatically scans:

```text
~/.config/opencode/your-legion/domains/marketing/workflows/*.md
~/.config/opencode/your-legion/domains/marketing/decisions/*.md
~/.config/opencode/your-legion/domains/marketing/examples/*.md
~/.config/opencode/your-legion/domains/marketing/skills/*.md
~/.config/opencode/your-legion/domains/marketing/skills/*/SKILL.md
```

Each discovered document is injected into agent prompts as a namespaced entry, for example `marketing/campaign-brief`. Agents are instructed to read the exact path from the Domain Skill Index instead of invoking the harness skill resolver.

Bundled domain components are loaded first, then global convention files under `~/.config/opencode/your-legion/domains/<domain-id>/`, then explicit overrides. This means a global `coding` component with the same id replaces the bundled component with that id.

### Domain Overrides

Any component can be extended or overridden by id:

```yaml
domains:
  financial-analytics:
    skills:
      common-data-query:
        path: ~/.config/opencode/your-legion/shared/skills/sql-query.md
    decisions:
      revenue-recognition:
        path: ~/experiments/new-revenue-rules.md
```

Override rules:

- Missing component maps still use convention discovery.
- A new id adds an extra component.
- A matching id replaces the convention-discovered path.
- `false` disables a convention-discovered component.

```yaml
domains:
  marketing:
    skills:
      campaign-brief: false
      launch-plan:
        path: ~/my-skills/custom-launch-plan.md
```

Relative override paths resolve from the directory containing `legionaries.yaml`. `~` expands to the current user's home directory.

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
- Domain packs add task context and domain-local skill indexes to the same agents. They do not create new agents by themselves.

## DIO Command

Your Legion injects `/dio` and `/dio-stop` into OpenCode:

- `/dio <objective>` starts an in-memory devotio completion loop for the current session.
- The loop continues on `session.idle` until `<dio_complete>...</dio_complete>` appears, `/dio-stop` is run, or the iteration guard is reached.
- DIO state is not persisted across OpenCode restarts.
