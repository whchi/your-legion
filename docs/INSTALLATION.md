# Installation

## Install

Use `bunx` when you have not installed the CLI globally:

```bash
bunx @whchi/your-legion install
```

Or with npm:

```bash
npx @whchi/your-legion install
```

If you want the shorter `your-legion <command>` form, install the package globally first:

```bash
bun install -g @whchi/your-legion
your-legion install
```

The rest of these docs use `bunx @whchi/your-legion ...` so every command is executable without assuming a global install.

The installer writes:

- `~/.config/opencode/opencode.json`, or updates an existing `~/.config/opencode/opencode.jsonc`
- `~/.config/opencode/legionaries.yaml`
- `~/.config/opencode/your-legion/domains/`

The installer enables `coding` by default. To pick bundled domains, pass a comma-separated `--domains` list:

```bash
bunx @whchi/your-legion install --domains coding,marketing,finance,accounting
```

Available bundled domains are `coding`, `marketing`, `finance`, and `accounting`. `--domains` also accepts a custom domain after that domain has been created under `~/.config/opencode/your-legion/domains/<domain-id>/DOMAIN.md`.

If `legionaries.yaml` already exists, it is backed up first using this format:

```text
~/.config/opencode/legionaries.yaml.bak.2026-01-25T11-18-28-014Z
```

Restart OpenCode after installation.

## Smoke Test

After restart, send a small discovery request:

```text
Explore where Your Legion builds the runtime agent config.
```

The default `orchestrator` should route this to `explorer`. Then try a small implementation request to confirm `builder` is available:

```text
Implement a tiny docs-only wording fix and report verification.
```

For more startup recipes, see [`EXAMPLES.md`](./EXAMPLES.md).

## Manual OpenCode Config

You can also install manually by registering the npm package name in OpenCode's `plugin` array.

You do not need a project-local `npm install` just to load the plugin. OpenCode downloads npm plugins automatically on startup and caches them under its cache directory, for example:

```text
~/.cache/opencode/packages/@whchi/your-legion@latest
```

Global config applies everywhere:

```text
~/.config/opencode/opencode.json
~/.config/opencode/opencode.jsonc
```

Project-local config applies only to that project/worktree:

```text
your-project/opencode.json
your-project/opencode.jsonc
```

Use this plugin entry in whichever config file you choose:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@whchi/your-legion"]
}
```

## Legionaries Config

Your Legion needs an agent model config named `legionaries.yaml`. The installer writes this to `~/.config/opencode/legionaries.yaml`.

The example file is here:

- [`legionaries.yaml`](../legionaries.yaml)
- Raw URL: `https://raw.githubusercontent.com/whchi/your-legion/main/legionaries.yaml`

For project-specific overrides, put `legionaries.yaml` in the root of the worktree where you run OpenCode. Project config takes precedence over the global file:

```text
your-project/legionaries.yaml
```

If you want to keep the model map somewhere else, start OpenCode with `LEGIONARIES_CONFIG`:

```bash
LEGIONARIES_CONFIG=/absolute/path/to/legionaries.yaml opencode
```

Use `LEGIONARIES_CONFIG` for an explicit config path.

## Domain Pack Directories

Your Legion uses global directories for optional domain packs:

```text
~/.config/opencode/your-legion/domains/
└── <domain-id>/
    ├── DOMAIN.md   # domain description used in routing
    ├── workflows/   # optional
    ├── decisions/   # optional
    ├── examples/    # optional
    └── skills/      # optional
```

The installer creates the base `domains/` directory. Add domain folders only for the domains you want to enable.

Create a domain pack manifest with the CLI:

```bash
bunx @whchi/your-legion create-domain marketing
```

`create-domain` is for new custom domain ids. It fails if the domain already exists globally or if the id is one of the bundled domains: `coding`, `marketing`, `finance`, or `accounting`.

For an explicit config directory, useful in tests or agent scripts:

```bash
bunx @whchi/your-legion create-domain marketing --config-dir ~/.config/opencode
```

By default this creates only `DOMAIN.md`. `DOMAIN.md` is the only description and component catalog used in the Domain Catalog. Component folders are optional capability facets; create them only when that domain has real versioned knowledge for the facet. Runtime only includes component paths listed in `DOMAIN.md`; unlisted folders are treated as absent.

To scaffold selected component folders in one command:

```bash
bunx @whchi/your-legion create-domain marketing --components workflows,decisions,skills
```

Available components are `workflows`, `decisions`, `examples`, and `skills`. Without `--enable`, the command prints a `legionaries.yaml` snippet so you can enable the domain manually.

To create and enable the domain in an already-installed `legionaries.yaml` in one command:

```bash
bunx @whchi/your-legion create-domain marketing --components workflows,decisions,skills --enable
```

To create first and enable during install:

```bash
bunx @whchi/your-legion create-domain product-ops --components decisions,skills
bunx @whchi/your-legion install --domains coding,product-ops
```

Enable global or bundled domain packs in `legionaries.yaml`:

```yaml
domains:
  coding: true
  marketing: true
  finance: true
  accounting: true
```

The bundled `coding` domain is enabled by the default config. The other bundled domains become available when enabled. To replace a bundled domain intentionally, author a global `DOMAIN.md` under `~/.config/opencode/your-legion/domains/<domain-id>/` yourself and list the component paths that should be exposed. `create-domain` refuses bundled ids because it is a new-domain scaffold command.

If you already keep shared skills in your harness/global skill directory, mount the exact file path into a domain with an override:

```yaml
domains:
  financial-analytics:
    skills:
      common-data-query:
        path: ~/.config/opencode/skills/sql-query.md
```

Domain skills are injected into Your Legion prompts as explicit paths. They are not registered as top-level OpenCode, Codex, or Claude skills, and Your Legion does not create a separate shared skill directory.

To verify domain usage after a session, inspect the trace for the current worktree:

```bash
bunx @whchi/your-legion trace --worktree . --limit 10
bunx @whchi/your-legion trace-check --worktree .
```

Trace events are stored under `~/.config/opencode/your-legion/traces/`. Contract warnings are warn-only at runtime, but `trace-check` exits non-zero so local verification can catch vague active domains, unknown domain refs, unknown domain skills, or a declared domain skill that was never read.

For a fixed acceptance flow, print the built-in domain scenario prompts:

```bash
bunx @whchi/your-legion domain-scenarios
```

Run the printed prompts in OpenCode, then verify that trace evidence contains the fixed domain scenario set:

```bash
bunx @whchi/your-legion domain-scenario-check --worktree .
```

## Supported Providers

The bundled example currently uses these provider prefixes:

- `openai`
- `github-copilot`
- `opencode-go`

Model values must use `provider/model-id` format, for example `openai/gpt-5.5`.

Every required system agent must have a model mapping under `system_agents`. Custom agents can be enabled under `custom_agents` after adding a matching YAML file under `src/custom-agents/`. The bundled config enables `src/custom-agents/code-reviewer.yaml` as the real custom-agent example. Optional `reasoning.effort` values are `low`, `medium`, `high`, `xhigh`, and `max`.

The plugin also injects `/dio` and `/dio-stop` commands for a session-local completion loop.

## Uninstall

Remove `@whchi/your-legion` from your OpenCode `plugin` array in whichever config file you used:

```text
~/.config/opencode/opencode.json
~/.config/opencode/opencode.jsonc
your-project/opencode.json
your-project/opencode.jsonc
```

Remove the global model config if you no longer need it:

```bash
rm ~/.config/opencode/legionaries.yaml
```

Remove cached plugin downloads if OpenCode has already loaded the package:

```bash
rm -rf ~/.cache/opencode/packages/@whchi/your-legion@latest
```

Restart OpenCode after uninstalling.
