# Examples

This page is the fastest path from "installed" to "I know how to shape this system."

## Minimal `legionaries.yaml`

Use this in the global `~/.config/opencode/legionaries.yaml` when you want one provider and no custom agents:

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
  verifier:
    model: openai/gpt-5.5
custom_agents: {}
domains:
  coding: true
```

Every required system agent must be listed. `custom_agents: {}` disables YAML custom agents.

## Recommended Mixed Providers

Use this in the global runtime config when you want a stronger router and planner, a coding-capable builder, and cheaper or reference-oriented discovery models. Replace every `provider/model-id` value with a provider and model already available in your OpenCode environment.

```yaml
system_agents:
  # orchestrator: reliable routing and compact context handoff.
  orchestrator:
    model: openai/gpt-5.5
    reasoning:
      effort: medium
  # explorer: fast repo discovery can use a cheaper model when it reads local facts.
  explorer:
    model: opencode-go/deepseek-v4-flash
    reasoning:
      effort: max
  # librarian: documentation and API reference lookup benefits from a reference-oriented model.
  librarian:
    model: opencode-go/minimax-m2.7
  # planner: higher reasoning helps sequencing, specs, and implementation plans.
  planner:
    model: openai/gpt-5.5
    reasoning:
      effort: high
  # builder: coding-capable execution model for implementation, tests, and verification.
  builder:
    model: opencode-go/kimi-k2.6
  # verifier: independent checker for maker/checker split and loop completion claims.
  verifier:
    model: openai/gpt-5.5
    reasoning:
      effort: high
custom_agents:
  code-reviewer:
    model: openai/gpt-5.5
    reasoning:
      effort: high
domains:
  coding: true
```

This is the style used by the repo's bundled example. It is a model responsibility map, not an instruction to create more agents.

## Add A Marketing Domain Pack

Scaffold the domain manifest:

```bash
bunx @whchi/your-legion create-domain marketing-ops
```

Use a new custom id here. `create-domain` refuses existing global domains and bundled domain ids, so do not use it to recreate `coding`, `marketing`, `finance`, or `accounting`. To use the bundled marketing domain, enable it with `install --add-domains marketing` or `domains.marketing: true` instead.

This creates:

```text
~/.config/opencode/your-legion/domains/marketing-ops/
└── DOMAIN.md
```

Edit `DOMAIN.md` with semantic routing guidance: when to use the marketing ops domain, when not to use it, and the domain-root relative `Workflows`, `Decisions`, `Examples`, and `Skills` paths.

Add only the component facets that carry real knowledge. For a marketing pack with campaign workflow, brand decisions, examples, and a domain skill, either create those files yourself or scaffold the folders and matching placeholders explicitly:

```bash
bunx @whchi/your-legion create-domain marketing-ops --components workflows,decisions,examples,skills
```

Create and enable in one command after installation:

```bash
bunx @whchi/your-legion create-domain marketing-ops --components workflows,decisions,examples,skills --enable
```

Then add the domain documents you want agents to see:

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

List that skill in `DOMAIN.md` with a path relative to the marketing domain root:

```md
Skills:
- `skills/campaign-brief/SKILL.md`
```

Enable it:

```yaml
domains:
  coding: true
  marketing: true
```

After restart, Your Legion injects the marketing description and namespaced entries such as `marketing/campaign-brief` into the Domain Catalog.

Agent scripts can call the same scaffold behavior directly:

```ts
import { createDomainPack } from '@whchi/your-legion/server'

createDomainPack({
  domainID: 'marketing',
  configDir: process.env.XDG_CONFIG_HOME
    ? `${process.env.XDG_CONFIG_HOME}/opencode`
    : `${process.env.HOME}/.config/opencode`,
})
```

## Mixed Coding And Marketing Work

Mixed-domain work should be split by responsibility inside the Task Context Envelope. The Domain Catalog describes which domains are available; `Active domains` is the task-local contract for a specific delegation.

Good delegation shape:

```text
Objective: Add a launch banner and matching launch copy.
Active domains:
- coding: implement the banner UI and tests
- marketing: write concise launch copy for developers
Domain refs:
- coding/implementation-loop
Domain skills:
- coding/make-code-change
- marketing/campaign-brief
Context refs:
- src/pages/launch.tsx
Constraints: Keep the change local; do not alter pricing or signup flow.
Expected output: Files changed, copy used, verification results.
Verification: Run the focused UI test and relevant build check.
```

Avoid vague active domains like `coding, marketing`. Name what each domain owns.

After the run, inspect runtime evidence:

> **NOTICE:** In Your Legion CLI commands, `--worktree` means the OpenCode workspace/project path used to key trace evidence. It does not require a Git worktree.

```bash
bunx @whchi/your-legion doctor --worktree .
bunx @whchi/your-legion trace --worktree . --limit 10
```

`delegation` events show which domains and skills were requested. `domain-read` events show which domain docs or domain skills were actually read.
`doctor` fails if `DOMAIN.md` declarations are invalid, a delegation declared unknown domain evidence, or a declared domain ref/skill was never read. It also reports usage stats for domains, refs, and skills.

For repeatable validation, use the fixed scenario set:

```bash
bunx @whchi/your-legion domain-scenarios
```

Ask the printed prompts, then run:

```bash
bunx @whchi/your-legion doctor --worktree . --scenarios
```

## Add A Legion Loop

Create a loop contract and repo-local inbox:

```bash
bunx @whchi/your-legion create-loop daily-ci-triage --worktree . --description "Daily CI triage" --objective "Find and verify CI fixes"
```

Then tune the generated `loops.daily-ci-triage` entry in `legionaries.yaml`:

```yaml
loops:
  daily-ci-triage:
    description: Daily CI and issue triage loop
    objective: Find actionable CI failures and produce verified fixes
    trigger: { type: scheduled, cadence: daily }
    inbox_path: docs/legion-loops/daily-ci-triage.md
    active_domains:
      - { id: coding, responsibility: triage CI failures and implement code fixes }
    domain_refs: [coding/implementation-loop]
    domain_skills: [coding/make-code-change]
    agents: { triage: planner, maker: builder, verifier: verifier }
    worktree: { isolation: required }
    verification:
      commands: ["bun test", "bun run build", "git diff --check"]
      completion: All commands pass and verifier reports no high or critical findings.
    connectors: { mode: manual, targets: [] }
```

When asking OpenCode to work inside the loop, the delegation should include:

```text
Loop: daily-ci-triage
```

Validate loop health and runtime evidence:

```bash
bunx @whchi/your-legion doctor --worktree .
bunx @whchi/your-legion loop-scenarios
bunx @whchi/your-legion doctor --worktree . --loop-scenarios
```

## Add A Custom Agent

Create `src/custom-agents/scribe.yaml` in the worktree where OpenCode runs:

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

Enable it in the global `legionaries.yaml`:

```yaml
custom_agents:
  scribe:
    model: openai/gpt-5.5
    reasoning:
      effort: low
```

The filename, YAML `name`, and `custom_agents` key must match. Custom agents run as subagents and cannot replace system agent names such as `builder`, `planner`, or `explorer`.

## Override A Bundled Domain Component

Use an override when you want to replace one component id already declared in the selected `DOMAIN.md`:

```yaml
domains:
  coding:
    decisions:
      engineering-guardrails:
        path: ./docs/agent-domain/coding-guardrails.md
```

Relative paths resolve from the directory containing the active `legionaries.yaml`, which is the global OpenCode config directory unless `LEGIONARIES_CONFIG` explicitly points elsewhere. Use absolute paths when an override should point at a repo-versioned document.

## Disable A Domain Component

Use `false` when one component declared in `DOMAIN.md` should not appear in the index:

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
