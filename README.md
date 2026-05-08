# your-legion

`your-legion` is a plugin-first OpenCode multi-agent system inspired by [`oh-my-openagent`](https://github.com/code-yeongyu/oh-my-openagent).

It provides one primary orchestrator, one workflow coordinator, and six leaf specialists. The plugin injects those agents into OpenCode at startup and reads per-agent model settings from `agent-providers.yaml`.

## Install

```bash
npm install @whchi/your-legion
```

## Configuration

The example agent model config is [`agent-providers.yaml`](./agent-providers.yaml). After installation, the same example file is available here:

```text
node_modules/@whchi/your-legion/agent-providers.yaml
```

Copy it to the root of the worktree where you run OpenCode:

```bash
cp node_modules/@whchi/your-legion/agent-providers.yaml ./agent-providers.yaml
```

Add the plugin to your OpenCode config, usually `~/.config/opencode/opencode.json` or project-local `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@whchi/your-legion"]
}
```

Restart OpenCode after changing either config file.

## Supported Providers

The bundled example currently uses these provider prefixes:

- `openai`
- `github-copilot`
- `opencode-go`

Model values must use `provider/model-id` format, for example `openai/gpt-5.5`.

## Agent Model Config

`agent-providers.yaml` maps each managed agent to a model:

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

Every managed agent must have a model mapping. Optional `reasoning.effort` values are `low`, `medium`, `high`, `xhigh`, and `max`.

If you want to keep the model map somewhere else, start OpenCode with `AGENT_PROVIDER_CONFIG`:

```bash
AGENT_PROVIDER_CONFIG=/absolute/path/to/agent-providers.yaml opencode
```

## Agents

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

- The `orchestrator` classifies each turn into one dominant intent and chooses a concrete subagent.
- Those intents are routing heuristics, not runtime categories or model profiles.
- The `dispatcher` is only used when work needs sequencing, decomposition, or parallel coordination across multiple specialists.
- `agent-providers.yaml` controls model and reasoning settings per agent. It does not control routing.

## Development

Development and contribution notes live in [`DEVELOPMENT.md`](./DEVELOPMENT.md).
