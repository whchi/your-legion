# Installation

## Install

Run the installer:

```bash
bunx @whchi/your-legion install
```

Or with npm:

```bash
npx @whchi/your-legion install
```

The installer writes:

- `~/.config/opencode/opencode.json`, or updates an existing `~/.config/opencode/opencode.jsonc`
- `~/.config/opencode/legionaries.yaml`

If `legionaries.yaml` already exists, it is backed up first using this format:

```text
~/.config/opencode/legionaries.yaml.bak.2026-01-25T11-18-28-014Z
```

Restart OpenCode after installation.

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
