# Custom Agents And DIO

This document is the implementation reference for the provider-based agent runtime and the DIO completion loop.

## Intent

Your Legion keeps its built-in agents as protected system agents while allowing users to add project or global custom agents without editing the package source. Runtime configuration is split by ownership:

- `system_agents`: model and reasoning settings for built-in Your Legion agents.
- `custom_agents`: model and reasoning settings for user-provided agent modules.

System agents are owned by the plugin and cannot be replaced by custom agents. Custom agents are discovered from OpenCode config locations and injected at startup when configured.

## Custom Agent Discovery

The runtime scans these directories:

- Global: `<opencode-config-dir>/your-legion/agents/*.ts`
- Project: `<worktree>/.opencode/your-legion/agents/*.ts`

Project-level files override global files with the same filename. The filename without extension is the OpenCode agent name.

Each custom module must export either:

- a default factory function, or
- a named factory using `create<PascalFileName>Agent`

The factory receives the configured model string and returns an OpenCode agent definition with:

- `description`
- `mode`
- `permission`
- `prompt`

## DIO Command

`/dio` means a devotio-style vow to finish the requested work. It is stateful per OpenCode session and keeps nudging the session forward on `session.idle` until one of these happens:

- the assistant emits `<dio_complete>...</dio_complete>`
- the user runs `/dio-stop`
- the loop reaches its max-iteration guard

DIO state is intentionally in memory for this version. It does not persist across OpenCode restarts.
