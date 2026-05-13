# Custom Agents And DIO

This document is the implementation reference for the provider-based agent runtime and the DIO completion loop.

## Intent

Your Legion keeps its built-in agents as protected system agents while allowing users to add custom agents with simple YAML files. Runtime configuration is split by ownership:

- `system_agents`: model and reasoning settings for built-in Your Legion agents.
- `custom_agents`: model and reasoning settings for YAML-defined custom agents.

System agents are owned by the plugin and cannot be replaced by custom agents. Custom agents are discovered from `src/custom-agents/` and injected at startup when configured.

## Custom Agent Discovery

The runtime scans:

- bundled package examples copied to `dist/custom-agents/`
- the active worktree's `src/custom-agents/*.yaml`

Worktree files override bundled examples with the same filename. The filename without extension is the OpenCode agent key.

Each YAML file must define:

- `name`
- `description`
- `permission`
- `prompt`

The `name` must match the filename and `custom_agents` key. Custom agents are loaded as `subagent`, and every permission key not listed in YAML is set to `deny`.

```yaml
name: heloman
description: I am a helo test agent here
permission:
  read: allow
prompt: |-
  response hello to everyone
```

`src/custom-agents/code-reviewer.yaml` is the bundled real-world example.

## DIO Command

`/dio` means a devotio-style vow to finish the requested work. It is stateful per OpenCode session and keeps nudging the session forward on `session.idle` until one of these happens:

- the assistant emits `<dio_complete>...</dio_complete>`
- the user runs `/dio-stop`
- the loop reaches its max-iteration guard

DIO state is intentionally in memory for this version. It does not persist across OpenCode restarts.
