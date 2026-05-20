# Your Legion

A plugin-first OpenCode multi-agent system inspired by [`oh-my-openagent`](https://github.com/code-yeongyu/oh-my-openagent).

It provides five protected system agents and YAML-defined custom agents. The plugin injects configured agents into OpenCode at startup and reads per-agent model settings from `legionaries.yaml`.

It also supports convention-first domain packs for a shared domain index and reusable domain capability documents. Domain packs let the same system and custom agents reference task-specific context such as engineering, marketing, or financial analytics without registering those documents as harness-level skills.

![](docs/architecture.svg)

## Quick Start

There are two ways to run the CLI:

- **No global install:** use `bunx @whchi/your-legion <command>`. This is the recommended copy-paste form in these docs.
- **Global install:** after `bun install -g @whchi/your-legion`, you may use `your-legion <command>` directly.

If you have not installed the package globally, commands like `your-legion install` will not exist in your shell.

Install the plugin and restart OpenCode:

```bash
bunx @whchi/your-legion install
```

The installer registers the plugin, writes `~/.config/opencode/legionaries.yaml`, and creates the base global domain pack directory.

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

Run the installer without a global install:

```bash
bunx @whchi/your-legion install
```

Or install the CLI globally first:

```bash
bun install -g @whchi/your-legion
your-legion install
```

The installer enables `coding` by default. To pick all bundled domains:

```bash
bunx @whchi/your-legion install --domains coding,marketing,finance,accounting
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
├── README.md
├── workflows/   # optional repeatable procedures
├── decisions/   # optional guardrails and constraints
├── examples/    # optional examples and output patterns
└── skills/      # optional domain-local skill instructions
```

These component folders are optional. A domain should contain the facets that carry real knowledge, not empty folders created for symmetry.

Enable a conventional domain pack with:

```yaml
domains:
  coding: true
  marketing: true
  finance: true
  accounting: true
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

Delegations use a compact Task Context Envelope with `Objective`, `Active domains`, `Domain refs`, `Domain skills`, `Context refs`, `Constraints`, `Expected output`, and `Verification`. Enabled domain packs are an index; `Active domains` marks the task-local context for a specific delegation.

Your Legion records warn-only domain usage evidence under `~/.config/opencode/your-legion/traces/`. Use `bunx @whchi/your-legion trace` to inspect recent delegation and domain-read events, and `bunx @whchi/your-legion trace-check` to fail CI or local acceptance when a delegation used unknown or vague domain context.

For a fixed domain-routing smoke test, run `bunx @whchi/your-legion domain-scenarios`, ask the printed prompts in OpenCode, then run `bunx @whchi/your-legion domain-scenario-check --worktree .`. The fixed set covers coding, marketing, finance, accounting, and their mixed-domain pairs.

The bundled domains are `coding`, `marketing`, `finance`, and `accounting`. `coding` is enabled by default; enable the others with `--domains` during install or by editing `legionaries.yaml`.

For hands-on examples of custom agents, marketing domain packs, mixed coding plus marketing work, and domain overrides, see [`EXAMPLES.md`](./docs/EXAMPLES.md).

## Routing Model

Your Legion uses direct specialist routing.

- The `orchestrator` classifies each turn into one dominant intent and chooses a concrete subagent.
- Those intents are routing heuristics, not runtime categories or model profiles.
- Multi-step work goes through `planner` first when sequencing is unclear, then `builder` executes approved implementation work.
- Code review is owned by the `/code-review` command by default; the bundled `code-reviewer` custom agent is available for explicit advanced workflows.
- `legionaries.yaml` controls model and reasoning settings per agent. It does not control routing.

## Commands

- `bunx @whchi/your-legion create-domain <domain-id> [--components workflows,decisions,examples,skills]`: scaffolds a global domain pack. By default it creates only `README.md`; use `--components` to add selected optional folders.
- `bunx @whchi/your-legion trace [--worktree <path>] [--limit <n>]`: prints recent domain usage evidence for a worktree.
- `bunx @whchi/your-legion trace-check [--worktree <path>]`: exits non-zero when recorded domain usage warnings exist.
- `bunx @whchi/your-legion domain-scenarios`: prints the fixed domain scenario prompts.
- `bunx @whchi/your-legion domain-scenario-check [--worktree <path>]`: verifies trace evidence for the fixed domain scenario set.
- `/dio`: a devotio-inspired completion loop that keeps the current session moving until the assistant emits `<dio_complete>...</dio_complete>`, `/dio-stop` is run, or the iteration guard is reached.
- `/dio-stop`: cancels the active DIO loop for the current session.

## Development

Development and contribution notes live in [`DEVELOPMENT.md`](./docs/DEVELOPMENT.md).
