A plugin-first OpenCode multi-agent system inspired by [`oh-my-openagent`](https://github.com/code-yeongyu/oh-my-openagent).

It provides five protected system agents and YAML-defined custom agents. The plugin injects configured agents into OpenCode at startup and reads per-agent model settings from `legionaries.yaml`.

![](docs/architecture.svg)

## Install

Run the installer:

```bash
bunx @whchi/your-legion install
```

For full setup, manual install, config paths, backups, and uninstall instructions, see [`INSTALLATION.md`](./docs/INSTALLATION.md).

## Configuration

Model mapping, provider selection, reasoning settings, and custom-agent enablement are configured in [`legionaries.yaml`](./legionaries.yaml). See [`CONFIGURATION.md`](./docs/CONFIGURATION.md) for the full schema and examples.

## Agents

- `orchestrator`: default primary router
- `planner`: design doc and implementation plan writer with docs-only edit permissions
- `builder`: implementation specialist for code, tests, and UI work
- `explorer`: read-only codebase discovery specialist
- `librarian`: read-only documentation and API reference specialist; prefers Context7 MCP for library docs
- `code-reviewer`: bundled YAML custom agent example for read-only review

Custom agents can be added by placing a YAML file under `src/custom-agents/`, then adding a matching `custom_agents` model entry.

## Routing Model

Your Legion uses direct specialist routing.

- The `orchestrator` classifies each turn into one dominant intent and chooses a concrete subagent.
- Those intents are routing heuristics, not runtime categories or model profiles.
- Multi-step work goes through `planner` first when sequencing is unclear, then `builder` executes approved implementation work.
- Code review is owned by the `/code-review` command by default; the bundled `code-reviewer` custom agent is available for explicit advanced workflows.
- `legionaries.yaml` controls model and reasoning settings per agent. It does not control routing.

## Commands

- `/dio`: a devotio-inspired completion loop that keeps the current session moving until the assistant emits `<dio_complete>...</dio_complete>`, `/dio-stop` is run, or the iteration guard is reached.
- `/dio-stop`: cancels the active DIO loop for the current session.

## Development

Development and contribution notes live in [`DEVELOPMENT.md`](./docs/DEVELOPMENT.md).
