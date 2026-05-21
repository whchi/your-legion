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

On first install, the installer writes:

- `~/.config/opencode/opencode.json`
- `~/.config/opencode/legionaries.yaml`
- `~/.config/opencode/your-legion/domains/`
- `~/.config/opencode/your-legion/domains/coding/`

The installer intentionally writes `opencode.json`. It does not modify existing `opencode.jsonc` files.

On reinstall, `install` preserves an existing `legionaries.yaml` unless you explicitly ask to change domains. It still ensures the plugin is registered and materializes any enabled bundled domain pack that is missing from the global domains directory.

The first install enables `coding` by default and writes the bundled `coding` domain pack under `~/.config/opencode/your-legion/domains/coding/`.

To replace the enabled domain list, pass a comma-separated `--domains` list:

```bash
bunx @whchi/your-legion install --domains coding,marketing,finance,accounting
```

To add domains without removing the existing enabled domains, use `--add-domains`:

```bash
bunx @whchi/your-legion install --add-domains marketing,finance
```

Available bundled domains are `coding`, `marketing`, `finance`, and `accounting`. Enabled bundled domains are copied into `~/.config/opencode/your-legion/domains/<domain-id>/` when that folder does not have `DOMAIN.md`. Existing global domain folders with `DOMAIN.md` are preserved and not overwritten. `--domains` and `--add-domains` also accept a custom domain after that domain has been created under `~/.config/opencode/your-legion/domains/<domain-id>/DOMAIN.md`.

`--domains` and `--add-domains` are mutually exclusive:

- `install`: first install creates config with `coding`; reinstall preserves existing config.
- `install --domains coding,marketing`: replaces `domains:` with exactly `coding` and `marketing`.
- `install --add-domains marketing,finance`: keeps existing `domains:` and adds `marketing` and `finance`.

If `legionaries.yaml` already exists and the command will change it, it is backed up first using this format:

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

The installer creates the base `domains/` directory and copies enabled bundled domain packs into it when missing. Add custom domain folders only for new domain ids you want to enable.

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

To scaffold selected component folders and matching placeholder files in one command:

```bash
bunx @whchi/your-legion create-domain marketing --components workflows,decisions,skills
```

Available components are `workflows`, `decisions`, `examples`, and `skills`. Each selected component also gets a placeholder file that matches the path declared in `DOMAIN.md`; selected skills get a placeholder `SKILL.md` with `name` and `description` frontmatter. Without `--enable`, the command prints a `legionaries.yaml` snippet so you can enable the domain manually.

To create and enable the domain in an already-installed `legionaries.yaml` in one command:

```bash
bunx @whchi/your-legion create-domain marketing --components workflows,decisions,skills --enable
```

To create first and enable during install:

```bash
bunx @whchi/your-legion create-domain product-ops --components decisions,skills
bunx @whchi/your-legion install --add-domains product-ops
```

Use `--domains coding,product-ops` only when you intentionally want to replace the full enabled domain list.

Enable global or bundled domain packs in `legionaries.yaml`:

```yaml
domains:
  coding: true
  marketing: true
  finance: true
  accounting: true
```

The bundled `coding` domain is enabled by the default config. The other bundled domains are materialized when enabled through `install --domains ...` or `install --add-domains ...`. To customize a bundled domain intentionally, edit the global copy under `~/.config/opencode/your-legion/domains/<domain-id>/` and list the component paths that should be exposed. Future installs preserve existing global domain folders that contain `DOMAIN.md` instead of overwriting them. `create-domain` refuses bundled ids because it is a new-domain scaffold command.

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
bunx @whchi/your-legion check --worktree .
bunx @whchi/your-legion trace --worktree . --limit 10
```

Trace events are stored under `~/.config/opencode/your-legion/traces/`. Contract warnings are warn-only at runtime, but `check` exits non-zero so local verification can catch invalid `DOMAIN.md` declarations, vague active domains, unknown domain refs, unknown domain skills, or declared domain refs and skills that were never read.

For a fixed acceptance flow, print the built-in domain scenario prompts:

```bash
bunx @whchi/your-legion domain-scenarios
```

Run the printed prompts in OpenCode, then verify that trace evidence contains the fixed domain scenario set:

```bash
bunx @whchi/your-legion check --worktree . --scenarios
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
