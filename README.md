# Your Legion

A plugin-first OpenCode multi-agent system inspired by [`oh-my-openagent`](https://github.com/code-yeongyu/oh-my-openagent).

It provides five protected system agents and YAML-defined custom agents. The plugin injects configured agents into OpenCode at startup and reads per-agent model settings from `legionaries.yaml`.

It also supports convention-first domain packs for a shared domain index and reusable domain capability documents. Domain packs let the same system and custom agents reference task-specific context such as engineering, marketing, or financial analytics without registering those documents as harness-level skills.

![](docs/architecture.svg)

## Quick Start

Install the plugin and restart OpenCode:

```bash
bunx @whchi/your-legion install
```

The installer registers the plugin, writes `~/.config/opencode/legionaries.yaml`, and creates the global domain pack directories.

After restart, try a small routing check:

```text
Explore where Your Legion builds the runtime agent config.
```

The `orchestrator` should route repo discovery to `explorer`. For a code change, ask for the change directly; the orchestrator should route implementation to `builder`.

Use these docs next:

- Install and uninstall details: [`INSTALLATION.md`](./docs/INSTALLATION.md)
- Config schema and field rules: [`CONFIGURATION.md`](./docs/CONFIGURATION.md)
- Copy-paste examples: [`EXAMPLES.md`](./docs/EXAMPLES.md)
- Development notes: [`DEVELOPMENT.md`](./docs/DEVELOPMENT.md)

## Install

Run the installer:

```bash
bunx @whchi/your-legion install
```

For full setup, manual install, config paths, backups, and uninstall instructions, see [`INSTALLATION.md`](./docs/INSTALLATION.md).

## Configuration

Model mapping, provider selection, reasoning settings, custom-agent enablement, and domain pack enablement are configured in [`legionaries.yaml`](./legionaries.yaml). See [`CONFIGURATION.md`](./docs/CONFIGURATION.md) for the full schema and examples.

Minimal usable config:

```yaml
system_agents:
  orchestrator:
    model: openai/gpt-5.5
  explorer:
    model: openai/gpt-5.5
  librarian:
    model: openai/gpt-5.5
  planner:
    model: openai/gpt-5.5
  builder:
    model: openai/gpt-5.5
custom_agents: {}
domains:
  coding: true
```

Domain packs live under your global OpenCode config:

```text
~/.config/opencode/your-legion/domains/{domain-id}/
├── workflows/
├── decisions/
├── examples/
└── skills/
```

Enable a conventional domain pack with:

```yaml
domains:
  coding: true
  marketing: true
  financial-analytics: true
```

## Agents

- `orchestrator`: default primary router
- `planner`: design doc and implementation plan writer with docs-only edit permissions
- `builder`: implementation specialist for code, tests, and UI work
- `explorer`: read-only codebase discovery specialist
- `librarian`: read-only documentation and API reference specialist; prefers Context7 MCP for library docs
- `code-reviewer`: bundled YAML custom agent example for read-only review

Custom agents can be added by placing a YAML file under `src/custom-agents/`, then adding a matching `custom_agents` model entry.

Domain skills are injected into agent prompts as a namespaced Domain Skill Index such as `marketing/campaign-brief`. Agents read the exact configured path; Your Legion does not register domain skills as top-level harness skills.

Delegations use a compact Task Context Envelope with `Objective`, `Active domains`, `Context refs`, `Constraints`, `Expected output`, and `Verification`. Enabled domain packs are an index; `Active domains` marks the task-local context for a specific delegation.

The bundled `coding` domain is enabled by default and provides a lightweight implementation loop, engineering guardrails, a change-report example, and a `coding/make-code-change` domain skill.

For hands-on examples of custom agents, marketing domain packs, mixed coding plus marketing work, and domain overrides, see [`EXAMPLES.md`](./docs/EXAMPLES.md).

## Routing Model

Your Legion uses direct specialist routing.

- The `orchestrator` classifies each turn into one dominant intent and chooses a concrete subagent.
- Those intents are routing heuristics, not runtime categories or model profiles.
- Multi-step work goes through `planner` first when sequencing is unclear, then `builder` executes approved implementation work.
- Code review is owned by the `/code-review` command by default; the bundled `code-reviewer` custom agent is available for explicit advanced workflows.
- `legionaries.yaml` controls model and reasoning settings per agent. It does not control routing.

## Commands

- `your-legion create-domain <domain-id>`: scaffolds a conventional global domain pack under `~/.config/opencode/your-legion/domains/<domain-id>/`.
- `/dio`: a devotio-inspired completion loop that keeps the current session moving until the assistant emits `<dio_complete>...</dio_complete>`, `/dio-stop` is run, or the iteration guard is reached.
- `/dio-stop`: cancels the active DIO loop for the current session.

## Development

Development and contribution notes live in [`DEVELOPMENT.md`](./docs/DEVELOPMENT.md).
