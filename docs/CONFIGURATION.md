# Configuration

Your Legion reads per-agent model, reasoning settings, and enabled domain packs from `legionaries.yaml` at startup. The plugin injects required system agents, configured YAML custom agents, and a Domain Skill Index into OpenCode automatically.

For copy-paste recipes, see [`EXAMPLES.md`](./EXAMPLES.md). This page is the reference for how the config is resolved and validated.

## File Location

Place `legionaries.yaml` in one of these locations (checked in order):

- `<worktree-root>/legionaries.yaml`
- `<opencode-config-dir>/legionaries.yaml`

`LEGIONARIES_CONFIG=/absolute/path/to/legionaries.yaml` takes precedence when set.

## Schema

The file has three top-level maps. Every required system agent must have an entry in `system_agents`. Custom agents are enabled through `custom_agents` and must have a matching YAML file under `src/custom-agents/`. Domain packs are enabled through `domains`.

```yaml
system_agents:
  <agent-name>:
    model: <provider>/<model-id>
    reasoning:
      effort: <low|medium|high|xhigh|max>
custom_agents:
  <custom-agent-name>:
    model: <provider>/<model-id>
    reasoning:
      effort: <low|medium|high|xhigh|max>
domains:
  <domain-id>: true
```

If you want to disable custom agents, set `custom_agents: {}` or omit the whole block.

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `system_agents.<name>.model` | yes for required system agents, yes when an optional system agent is present | Provider and model ID in `provider/model-id` format |
| `system_agents.<name>.reasoning.effort` | no | Reasoning effort level for supported providers |
| `custom_agents.<name>.model` | yes when a custom agent is present | Provider and model ID in `provider/model-id` format |
| `custom_agents.<name>.reasoning.effort` | no | Reasoning effort level for supported providers |
| `domains.<id>` | no | Enables a global convention-first domain pack or declares path overrides |

### Reasoning Effort

Optional values: `low`, `medium`, `high`, `xhigh`, `max`.
Only takes effect when the agent's provider supports reasoning effort.

## Example

This is the bundled example style:

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
custom_agents: {}
domains:
  coding: true
```

If you want the smallest one-provider config, use the minimal example in [`EXAMPLES.md`](./EXAMPLES.md#minimal-legionariesyaml).

### Optional Code Reviewer

`code-reviewer` is bundled as a real custom-agent example in [`code-reviewer.yaml`](../src/custom-agents/code-reviewer.yaml). The bundled `legionaries.yaml` enables it like this:

```yaml
custom_agents:
  code-reviewer:
    model: openai/gpt-5.5
    reasoning:
      effort: high
```

## Custom Agents

Place custom agent YAML files in:

- `src/custom-agents/*.yaml`

The filename without `.yaml` is the discovered agent key. The file's `name` must match that key and the `custom_agents` entry.

```yaml
name: scribe
description: Writes release notes and changelogs
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

```yaml
custom_agents:
  scribe:
    model: openai/gpt-5.5
    reasoning:
      effort: low
```

Custom agents run as `subagent`. Any permission key not listed in the YAML is set to `deny`. Custom agents cannot use system agent names such as `builder`, `planner`, or `explorer`.

## Domain Packs

Domain packs provide a shared domain index for the same system and custom agents. They are for reusable workflows, decisions, examples, and domain-local skills. They are not registered as harness-level skills and they are not automatically active task memory.

Use domain packs for reusable context. Use the Task Context Envelope for the specific context that applies to one delegation.

Your Legion ships four bundled domains:

| Domain | Bundled skill | Use when |
|--------|---------------|----------|
| `coding` | `coding/make-code-change` | implementing code, tests, config, or code-coupled docs |
| `marketing` | `marketing/campaign-brief` | writing launch copy, campaign briefs, positioning, or audience-facing copy |
| `finance` | `finance/financial-analysis` | analyzing pricing, runway, revenue, margin, cost, or financial tradeoffs |
| `accounting` | `accounting/accounting-review` | reviewing accounting treatment, recognition, classification, timing, or disclosure questions |

The installer defaults to `coding` only. To install with all bundled domains enabled:

```bash
bunx @whchi/your-legion install --domains coding,marketing,finance,accounting
```

The equivalent `legionaries.yaml` setting is:

```yaml
domains:
  coding: true
  marketing: true
  finance: true
  accounting: true
```

Enable only the domains you want active in the shared index. Enabled domains are still just an index; a task becomes domain-specific only when the Task Context Envelope names it under `Active domains`.

The orchestrator activates domain context per delegation through the Task Context Envelope:

```text
Objective:
Active domains:
Domain refs:
Domain skills:
Context refs:
Constraints:
Expected output:
Verification:
```

Use `Active domains` to state the task-local responsibility for each domain, such as `coding: implement UI` or `marketing: write launch copy`. Use `Domain refs` for workflows, decisions, and examples from the Domain Skill Index. Use `Domain skills` for namespaced domain skills such as `coding/make-code-change`. Keep the envelope compact and pass ordinary repo files in `Context refs` instead of copying long documents.

Example mixed-domain envelope:

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

### Domain Usage Evidence

Your Legion records warn-only runtime evidence for domain usage. The plugin observes delegation prompts and domain component reads, then writes JSONL events under:

```text
~/.config/opencode/your-legion/traces/<worktree-hash>.jsonl
```

Each event records the worktree, session id when available, event type, target agent, active domains, domain refs, domain skills, and contract warnings. This lets you answer two acceptance questions:

- Correct domain: `Active domains` in a `delegation` event must name the domain and responsibility that matches the task.
- Skill usage: `Domain skills` in a `delegation` event shows requested skills; `domain-read` events show domain skill files the agent actually read.

Inspect recent evidence:

```bash
bunx @whchi/your-legion trace --worktree . --limit 10
```

Fail local verification when warnings were recorded:

```bash
bunx @whchi/your-legion trace-check --worktree .
```

Warnings do not block runtime execution. They are designed for observability, review, and regression checks.

### Fixed Domain Scenario Validation

Use the built-in scenario set when you want a repeatable acceptance test instead of ad hoc prompts:

```bash
bunx @whchi/your-legion domain-scenarios
```

Ask the printed prompts in OpenCode. The fixed set currently checks:

- `coding-only`: must activate only `coding` and request `coding/make-code-change`.
- `marketing-only`: must activate only `marketing` and request `marketing/campaign-brief`.
- `coding-marketing`: must activate both domains with separate responsibilities and request both domain skills.
- `finance-only`: must activate only `finance` and request `finance/financial-analysis`.
- `accounting-only`: must activate only `accounting` and request `accounting/accounting-review`.
- `coding-finance`: must activate `coding` and `finance` with separate responsibilities.
- `coding-accounting`: must activate `coding` and `accounting` with separate responsibilities.
- `accounting-finance`: must activate `accounting` and `finance` with separate responsibilities.
- `finance-marketing`: must activate `finance` and `marketing` with separate responsibilities.

Then check the recorded trace:

```bash
bunx @whchi/your-legion domain-scenario-check --worktree .
```

The scenario check passes only when every fixed scenario has matching `delegation` evidence with no contract warnings.

The bundled `coding` domain is enabled by the default config. It includes:

- `coding/implementation-loop`
- `coding/engineering-guardrails`
- `coding/change-report`
- `coding/make-code-change`

After installation, global domain pack files live under:

```text
~/.config/opencode/your-legion/domains/
└── <domain-id>/
    ├── README.md
    ├── workflows/   # optional repeatable procedures
    ├── decisions/   # optional guardrails and constraints
    ├── examples/    # optional examples and output patterns
    └── skills/      # optional domain-local skill instructions
```

The four component folders are optional capability facets, not a required domain template. A domain is useful when at least one component contains real, versioned knowledge. Do not create empty `workflows/`, `decisions/`, `examples/`, or `skills/` folders just to make every domain look the same.

Scaffold a domain manifest:

```bash
bunx @whchi/your-legion create-domain marketing
```

This creates:

```text
~/.config/opencode/your-legion/domains/marketing/README.md
```

Scaffold selected optional component folders when you already know the domain needs them:

```bash
bunx @whchi/your-legion create-domain marketing --components workflows,decisions,skills
```

For test fixtures or agent scripts, pass the config directory explicitly:

```bash
bun src/cli.ts create-domain marketing --config-dir /tmp/opencode --components decisions,skills
```

Available component ids are `workflows`, `decisions`, `examples`, and `skills`. The CLI prints the created path, the selected components, and the `legionaries.yaml` enablement snippet.

Enable a domain that follows this convention with:

```yaml
domains:
  coding: true
  marketing: true
  finance: true
  accounting: true
```

For `marketing: true`, Your Legion automatically scans:

```text
~/.config/opencode/your-legion/domains/marketing/workflows/*.md
~/.config/opencode/your-legion/domains/marketing/decisions/*.md
~/.config/opencode/your-legion/domains/marketing/examples/*.md
~/.config/opencode/your-legion/domains/marketing/skills/*.md
~/.config/opencode/your-legion/domains/marketing/skills/*/SKILL.md
```

Folder meanings:

| Folder | File shape | Purpose | Injected as |
|--------|------------|---------|-------------|
| `workflows/` | `*.md` | Repeatable domain procedures, such as implementation loops, campaign planning, financial review, or accounting review | `domain-id/file-name` under `Workflows` |
| `decisions/` | `*.md` | Stable guardrails, policies, and domain decisions that should constrain agent behavior | `domain-id/file-name` under `Decisions` |
| `examples/` | `*.md` | Concrete examples, output shapes, and reference artifacts agents can compare against | `domain-id/file-name` under `Examples` |
| `skills/` | `*.md` or `<skill-id>/SKILL.md` | Domain-local skill instructions. These are read from exact paths and are not registered as harness top-level skills | `domain-id/skill-id` under `Skills` |

Use the facets by intent:

- Put a document in `decisions/` when it constrains future work: policy, forbidden behavior, approved terminology, accounting treatment, risk limits, or engineering guardrails.
- Put a document in `workflows/` when it describes repeatable execution: how to review a financial model, how to prepare launch copy, how to run an implementation loop.
- Put a document in `examples/` when agents should compare against a concrete artifact: previous copy, report shape, edge-case treatment, or accepted output format.
- Put a document in `skills/` when the domain has an executable instruction pattern that an agent should deliberately follow for a task.

It is normal for a domain to have only `decisions/`, only `skills/`, or any other subset. Runtime evidence warns if a domain is enabled and then used as active context while no bundled, global, or override components were discovered.

Example global domain pack:

```text
~/.config/opencode/your-legion/domains/finance/
├── workflows/
│   └── financial-review.md
├── decisions/
│   └── financial-guardrails.md
├── examples/
│   └── financial-summary.md
└── skills/
    └── financial-analysis/
        └── SKILL.md
```

With `domains.finance: true`, those files appear in the Domain Skill Index as:

```text
finance/financial-review
finance/financial-guardrails
finance/financial-summary
finance/financial-analysis
```

Each discovered document is injected into agent prompts as a namespaced entry, for example `marketing/campaign-brief`. Agents are instructed to read the exact path from the Domain Skill Index instead of invoking the harness skill resolver.

For a full marketing domain pack example, see [`EXAMPLES.md`](./EXAMPLES.md#add-a-marketing-domain-pack).

Bundled domain components are loaded first, then global convention files under `~/.config/opencode/your-legion/domains/<domain-id>/`, then explicit overrides. This means a global `coding` component with the same id replaces the bundled component with that id.

### Domain Overrides

Any component can be extended or overridden by id:

```yaml
domains:
  financial-analytics:
    skills:
      common-data-query:
        path: ~/.config/opencode/skills/sql-query.md
    decisions:
      revenue-recognition:
        path: ~/experiments/new-revenue-rules.md
```

Override rules:

- Missing component maps still use convention discovery.
- A new id adds an extra component.
- A matching id replaces the convention-discovered path.
- `false` disables a convention-discovered component.

```yaml
domains:
  marketing:
    skills:
      campaign-brief: false
      launch-plan:
        path: ~/my-skills/custom-launch-plan.md
```

Relative override paths resolve from the directory containing `legionaries.yaml`. `~` expands to the current user's home directory.

Prefer repo-relative override paths when a domain decision should be versioned with a project.

## Agent Descriptions

| Agent | Role |
|-------|------|
| `orchestrator` | Default primary router. Performs intent classification and routes each turn to the right specialist. |
| `explorer` | Read-only codebase discovery specialist. No shell, edits, or delegation. |
| `librarian` | Read-only documentation and API reference specialist. Prefers Context7 MCP for library and framework docs. |
| `planner` | Planning specialist for specs and implementation plans. |
| `builder` | Implementation specialist. Handles code changes, tests, configuration, verification, and UI/frontend work. |
| `code-reviewer` | Bundled YAML custom agent for read-only review. |

## Routing Notes

- `legionaries.yaml` controls **model and reasoning settings** per agent and enables custom agents. It does **not** decide primary system routing.
- Different agents may use different providers in the same config.
- Model values must use `provider/model-id` format.
- Code review is handled by the `/code-review` command by default; the bundled `code-reviewer` custom agent is enabled in `legionaries.yaml` as an example.
- Domain packs add domain-local skill indexes to the same agents. They do not create new agents by themselves, and enabled domains become active only when named in a Task Context Envelope.

## DIO Command

Your Legion injects `/dio` and `/dio-stop` into OpenCode:

- `/dio <objective>` starts an in-memory devotio completion loop for the current session.
- The loop continues on `session.idle` until `<dio_complete>...</dio_complete>` appears, `/dio-stop` is run, or the iteration guard is reached.
- DIO state is not persisted across OpenCode restarts.
