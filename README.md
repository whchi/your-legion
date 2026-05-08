# your-legion

`your-legion` is a plugin-first OpenCode multi-agent system inspired by [`oh-my-openagent`](https://github.com/code-yeongyu/oh-my-openagent).

It provides one primary orchestrator, one workflow coordinator, and six leaf specialists. The plugin injects those agents into OpenCode at startup and reads per-agent model settings from `agent-providers.yaml`.

## Install

```bash
npm install @whchi/your-legion
```

## Quick Start

From the project where you run OpenCode:

```bash
npm install @whchi/your-legion
cp node_modules/@whchi/your-legion/agent-providers.yaml ./agent-providers.yaml
```

Then add the plugin to your OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@whchi/your-legion"]
}
```

Edit `agent-providers.yaml` to use models available in your OpenCode providers, then restart OpenCode.

## Configure OpenCode

Installing the npm package only installs the plugin code. You still need two config entries:

- OpenCode plugin config: tells OpenCode to load `@whchi/your-legion`.
- `agent-providers.yaml`: tells Your Legion which model each agent should use.

### 1. Add The Plugin

Add the plugin to your OpenCode config file, usually `~/.config/opencode/opencode.json` or your project-local `opencode.jsonc`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@whchi/your-legion"]
}
```

### 2. Add Agent Model Settings

Create `agent-providers.yaml` in the root of the worktree where you run OpenCode:

```text
your-project/
├── agent-providers.yaml
└── ...
```

You can copy the example shipped with the package:

```bash
cp node_modules/@whchi/your-legion/agent-providers.yaml ./agent-providers.yaml
```

Or create one manually:

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

If you want to keep the model map somewhere else, set `AGENT_PROVIDER_CONFIG` to that file path before starting OpenCode.

```bash
AGENT_PROVIDER_CONFIG=/absolute/path/to/agent-providers.yaml opencode
```

After setup, a project-local configuration usually looks like this:

```text
your-project/
├── agent-providers.yaml
├── node_modules/
│   └── @whchi/your-legion/
└── opencode.jsonc
```

Restart OpenCode after changing `opencode.json`, `opencode.jsonc`, `agent-providers.yaml`, or `AGENT_PROVIDER_CONFIG`.

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
- `planner`, `builder`, `frontend-developer`, `code-reviewer`, `explorer`, and `librarian` are leaf specialists.
- `agent-providers.yaml` controls model and reasoning settings per agent. It does not control routing.

## Model Configuration

Every managed agent must have a model mapping in `agent-providers.yaml`.

- Models must use `provider/model-id` format.
- Different agents may use different providers in the same file.
- `reasoning.effort` is optional and may be `low`, `medium`, `high`, `xhigh`, or `max`.
- Reasoning settings are passed through to `agent.options.reasoning`.

## Agent Boundaries

- Use `builder` for non-visual code changes, tests, refactors, config, and backend logic.
- Use `frontend-developer` for UI, layout, styling, accessibility, and client-side interaction work.
- Use `explorer` for repo-local discovery and impact analysis.
- Use `librarian` for external docs, API references, and package behavior lookup.

## Development

Development and contribution notes live in [`DEVELOPMENT.md`](./DEVELOPMENT.md).
