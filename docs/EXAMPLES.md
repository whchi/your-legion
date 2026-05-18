# Examples

This page is the fastest path from "installed" to "I know how to shape this system."

## Minimal `legionaries.yaml`

Use this when you want one provider and no custom agents:

```yaml
system_agents:
  orchestrator:
    model: openai/gpt-5.5
    reasoning:
      effort: medium
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

Every required system agent must be listed. `custom_agents: {}` disables YAML custom agents.

## Mixed Providers

Use this when you want a stronger router and planner, with cheaper implementation and discovery models:

```yaml
system_agents:
  orchestrator:
    model: openai/gpt-5.5
    reasoning:
      effort: medium
  explorer:
    model: opencode-go/deepseek-v4-flash
    reasoning:
      effort: max
  librarian:
    model: opencode-go/minimax-m2.7
  planner:
    model: openai/gpt-5.5
    reasoning:
      effort: high
  builder:
    model: opencode-go/kimi-k2.6
custom_agents:
  code-reviewer:
    model: openai/gpt-5.5
    reasoning:
      effort: high
domains:
  coding: true
```

This is the style used by the repo's bundled example.

## Add A Marketing Domain Pack

Create these files under your OpenCode config directory:

```text
~/.config/opencode/your-legion/domains/marketing/
├── workflows/
│   └── campaign-planning.md
├── decisions/
│   └── brand-voice.md
├── examples/
│   └── launch-post.md
└── skills/
    └── campaign-brief/
        └── SKILL.md
```

Example `skills/campaign-brief/SKILL.md`:

```markdown
# Campaign Brief

Use this when a task needs launch positioning, audience definition, channel choices, or campaign copy.

Return:

- target audience
- positioning angle
- channel plan
- copy constraints
- success metric
```

Enable it:

```yaml
domains:
  coding: true
  marketing: true
```

After restart, Your Legion injects namespaced entries such as `marketing/campaign-brief` into the Domain Skill Index.

## Mixed Coding And Marketing Work

Mixed-domain work should be split by responsibility inside the Task Context Envelope. The enabled domain list is only an index; the active domain list is the task-local contract.

Good delegation shape:

```text
Objective: Add a launch banner and matching launch copy.
Active domains:
- coding: implement the banner UI and tests
- marketing: write concise launch copy for developers
Context refs:
- coding/make-code-change
- marketing/campaign-brief
Constraints: Keep the change local; do not alter pricing or signup flow.
Expected output: Files changed, copy used, verification results.
Verification: Run the focused UI test and relevant build check.
```

Avoid vague active domains like `coding, marketing`. Name what each domain owns.

## Add A Custom Agent

Create `src/custom-agents/scribe.yaml`:

```yaml
name: scribe
description: Writes release notes and changelogs from repository context
permission:
  read: allow
  glob: allow
  grep: allow
  edit: deny
  bash: deny
  task: deny
prompt: |-
  # Scribe

  Write concise release notes from repository context.
```

Enable it in `legionaries.yaml`:

```yaml
custom_agents:
  scribe:
    model: openai/gpt-5.5
    reasoning:
      effort: low
```

The filename, YAML `name`, and `custom_agents` key must match. Custom agents run as subagents and cannot replace system agent names such as `builder`, `planner`, or `explorer`.

## Override A Bundled Domain Component

Use an override when you want to replace one bundled or convention-discovered component by id:

```yaml
domains:
  coding:
    decisions:
      engineering-guardrails:
        path: ./docs/agent-domain/coding-guardrails.md
```

Relative paths resolve from the directory containing `legionaries.yaml`. Use this for repo-versioned decisions that should travel with a project.

## Disable A Domain Component

Use `false` when one convention-discovered component should not appear in the index:

```yaml
domains:
  marketing:
    skills:
      campaign-brief: false
```

## First Smoke Tests

After installing and restarting OpenCode, try:

```text
Explore where runtime agent config is assembled.
```

Expected route: `explorer`.

```text
Plan a small change that adds a new custom agent example.
```

Expected route: `planner`.

```text
Implement a small docs-only typo fix and verify it.
```

Expected route: `builder`.

```text
Look up the official docs for a library API before changing code.
```

Expected route: `librarian`.

For review-only work, use `/code-review`; code review is command-owned by default.
