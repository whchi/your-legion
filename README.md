# your-legion

`your-legion` is a plugin-first OpenCode multi-agent system inspired by [`oh-my-openagent`](https://github.com/code-yeongyu/oh-my-openagent).

It provides one primary orchestrator, one workflow coordinator, and six leaf specialists. The plugin injects those agents into OpenCode at startup and reads per-agent model settings from `legionaries.yaml`.

## Install

Run the installer:

```bash
bunx @whchi/your-legion install
```

For full setup, manual install, config paths, backups, and uninstall instructions, see [`INSTALLATION.md`](./INSTALLATION.md).

## Supported Providers

The bundled example currently uses these provider prefixes:

- `openai`
- `github-copilot`
- `opencode-go`

Model values must use `provider/model-id` format, for example `openai/gpt-5.5`.

Every managed agent must have a model mapping in `legionaries.yaml`. Optional `reasoning.effort` values are `low`, `medium`, `high`, `xhigh`, and `max`.

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
- `legionaries.yaml` controls model and reasoning settings per agent. It does not control routing.

## Development

Development and contribution notes live in [`DEVELOPMENT.md`](./DEVELOPMENT.md).
