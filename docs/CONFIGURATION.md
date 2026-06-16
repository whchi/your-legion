# Configuration

Your Legion reads per-agent model, reasoning settings, custom-agent enablement, enabled domain packs, and configured Legion Loops from the global `legionaries.yaml` at startup. The plugin injects required system agents, configured YAML custom agents, a Domain Catalog, and a Loop Catalog into OpenCode automatically.

For copy-paste recipes, see [`EXAMPLES.md`](./EXAMPLES.md). This page is the reference for how the config is resolved and validated.

## File Location

The runtime config file is global:

- `<opencode-config-dir>/legionaries.yaml`

There is no project-level `legionaries.yaml` resolution. A `legionaries.yaml` file in the worktree root is ignored. Use `LEGIONARIES_CONFIG=/absolute/path/to/legionaries.yaml` only when you explicitly want to run with a non-global config.

## Schema

The file has four top-level maps. Every required system agent should have an entry in `system_agents`. Custom agents are enabled through `custom_agents` and must have a matching YAML file under `src/custom-agents/`. Domain packs are enabled through `domains`. Legion Loops are configured through `loops`.

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
loops:
  <loop-id>:
    description: <short description>
    objective: <long-running goal>
    trigger: { type: <manual|scheduled|external> }
    inbox_path: <repo-relative markdown path>
    verification:
      commands: [<command>]
      completion: <completion rule>
```

If you want to disable custom agents, set `custom_agents: {}` or omit the whole block.

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `system_agents.<name>.model` | yes for required system agents | Provider and model ID in `provider/model-id` format |
| `system_agents.<name>.reasoning.effort` | no | Reasoning effort level for supported providers |
| `custom_agents.<name>.model` | yes when a custom agent is present | Provider and model ID in `provider/model-id` format |
| `custom_agents.<name>.reasoning.effort` | no | Reasoning effort level for supported providers |
| `domains.<id>` | no | Enables a bundled or global `DOMAIN.md`-declared domain pack, with optional same-id path overrides |
| `loops.<id>` | no | Defines a recurring or goal-driven Legion Loop contract |

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
  verifier:
    model: openai/gpt-5.5
    reasoning:
      effort: high
custom_agents: {}
domains:
  coding: true
```

Configs that omit `system_agents.verifier` fail fast. Add `system_agents.verifier.model` explicitly when upgrading an older config.

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

## How To Choose Models

Choose models by agent responsibility, not by imagined team roles. The model map is an operator-controlled capability boundary; routing still depends on task intent.

Use the agent responsibilities in [Agent Reference](#agent-reference) to choose the model class: reliable routing for the primary agent, stronger reasoning for planning, coding capability for execution, and cheaper or reference-oriented models for read-only discovery. The provider/model IDs in examples are placeholders for providers already available in your OpenCode environment. Keep every entry in `provider/model-id` format and avoid adding extra agents just to use another provider.

## Custom Agents

Custom agent definitions are discovered from bundled package examples and from the active worktree. To define one in a worktree, place the YAML file in:

- `src/custom-agents/*.yaml`

The filename without `.yaml` is the discovered agent key. The file's `name` must match that key and the global `custom_agents` entry.

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

Custom agents run as `subagent`. Any permission key not listed in the YAML is set to `deny`. Custom agents cannot use system agent names such as `builder`, `planner`, or `explorer`. A worktree definition with the same name as a bundled custom agent overrides the bundled definition; the model mapping still comes from the global runtime config.

## Domain Packs

Domain packs provide a shared Domain Catalog for the same system and custom agents. They are self-describing capabilities with reusable workflows, decisions, examples, and domain-local skills. They are not registered as harness-level skills and they are not automatically active task memory.

Use domain packs for reusable context. Use the Task Context Envelope for the specific context that applies to one delegation.

The design references behind description-driven domain selection and runtime evidence are summarized in [`academic-papers-summary.md`](./academic-papers-summary.md).

Your Legion ships four bundled domains:

| Domain | Bundled skill | Use when |
|--------|---------------|----------|
| `coding` | `coding/make-code-change` | implementing code, tests, config, or code-coupled docs |
| `marketing` | `marketing/campaign-brief` | writing launch copy, campaign briefs, positioning, or audience-facing copy |
| `finance` | `finance/financial-analysis` | analyzing pricing, runway, revenue, margin, cost, or financial tradeoffs |
| `accounting` | `accounting/apply-accounting-review` | reviewing accounting treatment, recognition, classification, timing, or disclosure questions |

The first install defaults to `coding` only and materializes the bundled `coding` pack under `~/.config/opencode/your-legion/domains/coding/`. A reinstall without domain flags preserves the existing `legionaries.yaml` and copies any enabled bundled domain pack that is still missing from the global domains directory.

To replace the enabled domain list with all bundled domains and materialize their files under the global domains directory:

```bash
bunx @whchi/your-legion install --domains coding,marketing,finance,accounting
```

To add domains without removing existing enabled domains:

```bash
bunx @whchi/your-legion install --add-domains marketing,finance
```

The equivalent `legionaries.yaml` setting is:

```yaml
domains:
  coding: true
  marketing: true
  finance: true
  accounting: true
```

Enable only the domains you want available in the Domain Catalog. A task becomes domain-specific only when the orchestrator decides that a domain description materially applies and names it under `Active domains`.

Each domain's routing description comes only from `DOMAIN.md`. Resolution order is:

```text
global DOMAIN.md
bundled DOMAIN.md
```

If neither file exists, the enabled domain is omitted from the Domain Catalog until a `DOMAIN.md` is added.

Keep `DOMAIN.md` short and semantic. It should describe when the domain applies and when it does not apply, then list available `Workflows`, `Decisions`, `Examples`, and `Skills` with domain-root relative component paths. Do not write keyword trigger rules.

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

Before delegation, the orchestrator compares the task with the Domain Catalog. Use `Active domains` to state the task-local responsibility for each domain, such as `coding: implement UI` or `marketing: write launch copy`. Use `Domain refs` for workflows, decisions, and examples from the Domain Catalog. Use `Domain skills` for namespaced domain skills such as `coding/make-code-change`. Keep the envelope compact and pass ordinary repo files in `Context refs` instead of copying long documents.

If no domain is configured or no domain description clearly matches the task, use no-domain delegation:

```text
Active domains: none
Domain refs: none
Domain skills: none
```

No-domain delegation is normal behavior, not a contract warning.

## Legion Loops

Legion Loops define recurring or goal-driven engineering workflows. Use presets for setup, then edit the generated config only when the defaults need project-specific tuning.

For the friendliest setup path, create loops from presets and generate the run prompt instead of hand-writing the full YAML first:

```bash
bunx @whchi/your-legion loop-presets
bunx @whchi/your-legion create-loop daily-ci-triage --preset ci-triage --worktree .
bunx @whchi/your-legion loop-prompt daily-ci-triage --worktree .
```

The generated config is ordinary `legionaries.yaml` and can be edited later:

Important rules:

- `inbox_path` must be a repo-relative path.
- `agents.maker` and `agents.verifier` must be different.
- `domain_refs` and `domain_skills` must refer to enabled Domain Catalog entries.
- `trigger` is a contract field. Use `manual`, `scheduled`, or `external`; execution is still started by OpenCode, CI, cron, hooks, or a future runner.

Create and inspect loops with:

```bash
bunx @whchi/your-legion create-loop daily-ci-triage --preset ci-triage --worktree .
bunx @whchi/your-legion loops
bunx @whchi/your-legion loop-runs --worktree . --loop daily-ci-triage
bunx @whchi/your-legion doctor --worktree .
```

See [`LEGION_LOOPS.md`](./LEGION_LOOPS.md) for the full workflow and detailed parameter reference.

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

Each event records the worktree, session id when available, delegation id when available, event type, target agent, active domains, domain refs, domain skills, and contract warnings. This lets you answer two acceptance questions:

- Correct domain: `Active domains` in a `delegation` event must name the domain and responsibility that matches the task.
- Ref and skill usage: `Domain refs` and `Domain skills` in a `delegation` event show requested domain context; `domain-read` events show domain component files the agent actually read. `doctor` fails when a delegation declares a domain ref or skill but no matching read is recorded for that delegation, and it reports usage stats by domain, ref, and skill.

Inspect recent evidence:

> **NOTICE:** In Your Legion CLI commands, `--worktree` means the OpenCode workspace/project path used to key trace evidence. It does not require a Git worktree.

```bash
bunx @whchi/your-legion doctor --worktree .
bunx @whchi/your-legion trace --worktree . --limit 10
```

Fail local verification when warnings were recorded:

```bash
bunx @whchi/your-legion doctor --worktree .
```

Warnings do not block runtime execution. They are designed for observability, review, and regression checks.

### Fixed Domain Scenario Validation

Use the built-in scenario set when you want a repeatable acceptance test instead of ad hoc prompts:

```bash
bunx @whchi/your-legion domain-scenarios
```

Ask the printed prompts in OpenCode. The fixed set currently checks:

- `no-domain-no-catalog`: must use `Active domains: none`, `Domain refs: none`, and `Domain skills: none` when no domain catalog is configured.
- `no-domain-ambiguous`: must use no-domain delegation when enabled domains exist but no domain description clearly matches.
- `coding-only`: must activate only `coding` and request `coding/make-code-change`.
- `marketing-only`: must activate only `marketing` and request `marketing/campaign-brief`.
- `coding-marketing`: must activate both domains with separate responsibilities and request both domain skills.
- `finance-only`: must activate only `finance` and request `finance/financial-analysis`.
- `accounting-only`: must activate only `accounting` and request `accounting/apply-accounting-review`.
- `coding-finance`: must activate `coding` and `finance` with separate responsibilities.
- `coding-accounting`: must activate `coding` and `accounting` with separate responsibilities.
- `accounting-finance`: must activate `accounting` and `finance` with separate responsibilities.
- `finance-marketing`: must activate `finance` and `marketing` with separate responsibilities.

Then diagnose the recorded trace:

```bash
bunx @whchi/your-legion doctor --worktree . --scenarios
```

The scenario diagnostics pass only when every fixed scenario has matching `delegation` evidence with no contract warnings.

The installed config enables the bundled `coding` domain on first install. It includes:

- `coding/implementation-loop`
- `coding/engineering-guardrails`
- `coding/change-report`
- `coding/make-code-change`

After installation, global domain pack files live under:

```text
~/.config/opencode/your-legion/domains/
└── <domain-id>/
    ├── DOMAIN.md   # domain description used in the Domain Catalog
    ├── workflows/   # optional repeatable procedures
    ├── decisions/   # optional guardrails and constraints
    ├── examples/    # optional examples and output patterns
    └── skills/      # optional domain-local skill instructions
```

`DOMAIN.md` is required for a useful description-driven domain. The four component folders are optional capability facets, not a required domain template. A domain is useful when `DOMAIN.md` describes a real capability and lists the relevant `Workflows`, `Decisions`, `Examples`, and `Skills` that actually exist. Do not create empty `workflows/`, `decisions/`, `examples/`, or `skills/` folders just to make every domain look the same.

The installer copies enabled bundled domains (`coding`, `marketing`, `finance`, `accounting`) into this directory when the corresponding folder does not have `DOMAIN.md`. It does not overwrite an existing global domain folder with `DOMAIN.md`, so local edits to a materialized bundled domain remain under your control.

List domain-root relative paths directly in `DOMAIN.md`; do not use aliases, arrows, id-to-path mappings, or repeat the domain id. The domain file itself should be enough to locate the required files:

```md
Workflows:
- `workflows/accounting-review.md`

Decisions:
- `decisions/accounting-guardrails.md`

Examples:
- `examples/accounting-treatment.md`

Skills:
- `skills/apply-accounting-review/SKILL.md`
```

Scaffold a domain manifest:

```bash
bunx @whchi/your-legion create-domain marketing-ops
```

`create-domain` only creates new custom domains. It refuses existing global domain ids and bundled ids (`coding`, `marketing`, `finance`, `accounting`).

This creates:

```text
~/.config/opencode/your-legion/domains/marketing-ops/DOMAIN.md
```

Scaffold selected optional component folders and matching placeholder files when you already know the domain needs them:

```bash
bunx @whchi/your-legion create-domain marketing-ops --components workflows,decisions,skills
```

For test fixtures or agent scripts, pass the config directory explicitly:

```bash
bun src/cli.ts create-domain marketing-ops --config-dir /tmp/opencode --components decisions,skills
```

Available component ids are `workflows`, `decisions`, `examples`, and `skills`. The CLI prints the created path, the selected components, and the `legionaries.yaml` enablement snippet. Each selected component gets a placeholder file that matches the path declared in `DOMAIN.md`; selected skills get `SKILL.md` frontmatter so `doctor` can validate the scaffold immediately.

Create and enable a custom domain in one command after installation:

```bash
bunx @whchi/your-legion create-domain marketing-ops --components workflows,decisions,skills --enable
```

Or create it first and include it in install:

```bash
bunx @whchi/your-legion create-domain product-ops --components decisions,skills
bunx @whchi/your-legion install --add-domains product-ops
```

Use `--domains coding,product-ops` only when you intentionally want to replace the full enabled domain list.

Enable a domain with:

```yaml
domains:
  coding: true
  marketing: true
  finance: true
  accounting: true
```

For `marketing: true`, Your Legion reads the component paths listed in `DOMAIN.md`. It does not scan folders to invent catalog entries. If a component kind or file path is not listed in `DOMAIN.md`, runtime treats it as absent even when the file exists on disk.

Example `DOMAIN.md` component catalog:

```md
Workflows:
- `workflows/campaign-planning.md`

Decisions:
- `decisions/brand-voice.md`

Examples:
- `examples/launch-copy.md`

Skills:
- `skills/campaign-brief/SKILL.md`
```

Folder meanings:

| Folder | File shape | Purpose | Injected as |
|--------|------------|---------|-------------|
| `workflows/` | `*.md` | Repeatable domain procedures, such as implementation loops, campaign planning, financial review, or accounting review | Only when listed as `workflows/file-name.md` under `Workflows` |
| `decisions/` | `*.md` | Stable guardrails, policies, and domain decisions that should constrain agent behavior | Only when listed as `decisions/file-name.md` under `Decisions` |
| `examples/` | `*.md` | Concrete examples, output shapes, and reference artifacts agents can compare against | Only when listed as `examples/file-name.md` under `Examples` |
| `skills/` | `<skill-id>/SKILL.md` | Domain-local skill instructions. These are read from exact paths and are not registered as harness top-level skills | Only when listed as `skills/skill-id/SKILL.md` under `Skills` |

Use the facets by intent:

- Put a document in `decisions/` when it constrains future work: policy, forbidden behavior, approved terminology, accounting treatment, risk limits, or engineering guardrails.
- Put a document in `workflows/` when it describes repeatable execution: how to review a financial model, how to prepare launch copy, how to run an implementation loop.
- Put a document in `examples/` when agents should compare against a concrete artifact: previous copy, report shape, edge-case treatment, or accepted output format.
- Put a document in `skills/` when the domain has an executable instruction pattern that an agent should deliberately follow for a task.

It is normal for a domain to have only `decisions/`, only `skills/`, or any other subset. Runtime evidence warns if a domain is enabled and then used as active context while no bundled, global, or override components were discovered.

Example global domain pack:

```text
~/.config/opencode/your-legion/domains/finance/
├── DOMAIN.md
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

The matching `DOMAIN.md` must list the domain-root relative paths:

```md
Workflows:
- `workflows/financial-review.md`

Decisions:
- `decisions/financial-guardrails.md`

Examples:
- `examples/financial-summary.md`

Skills:
- `skills/financial-analysis/SKILL.md`
```

With `domains.finance: true`, those files appear in the Domain Catalog as:

```text
finance/financial-review
finance/financial-guardrails
finance/financial-summary
finance/financial-analysis
```

Each declared document is injected into agent prompts as a namespaced entry, for example `marketing/campaign-brief`. Agents are instructed to read the exact path from the Domain Catalog instead of invoking the harness skill resolver.

Component files may include optional frontmatter hints:

```md
---
when_to_use: Use for launch sequencing, campaign planning, and go-to-market coordination.
signals:
  - launch
  - campaign
---
```

Your Legion includes these hints next to the catalog id and path. They help routing agents choose compact Domain refs, but they are not keyword triggers and they do not execute workflows.

For a full marketing domain pack example, see [`EXAMPLES.md`](./EXAMPLES.md#add-a-marketing-domain-pack).

Bundled `DOMAIN.md` is used unless a global `DOMAIN.md` exists for the same domain. Normal installer usage materializes enabled bundled domains into the global directory, so the global copy becomes the editable source for that install. A global `DOMAIN.md` replaces the bundled domain description and component catalog for that domain. Explicit overrides can replace or disable component ids that are already declared in the selected `DOMAIN.md`; they do not add undeclared components.

### Domain Overrides

Any component declared in `DOMAIN.md` can be overridden by id:

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

- Missing component maps use the paths declared in `DOMAIN.md`.
- A matching id replaces the declared path.
- `false` disables a declared component.
- A new id that is not listed in `DOMAIN.md` is ignored; add it to `DOMAIN.md` first if the domain should expose it.

```yaml
domains:
  marketing:
    skills:
      campaign-brief: false
      launch-plan:
        path: ~/my-skills/custom-launch-plan.md
```

Relative override paths resolve from the directory containing the active `legionaries.yaml`, which is normally `~/.config/opencode/`. `~` expands to the current user's home directory.

Use absolute paths when a domain decision should point at a repo-versioned document.

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

- Global `legionaries.yaml` controls **model and reasoning settings** per agent, enables custom agents, and enables domain packs. It does **not** decide primary system routing.
- Different agents may use different providers in the same config.
- Model values must use `provider/model-id` format.
- Code review is handled by the `/code-review` command by default; the bundled `code-reviewer` custom agent is enabled in `legionaries.yaml` as an example.
- Domain packs add domain descriptions and domain-local skill entries to the same agents through the Domain Catalog. They do not create new agents by themselves, and enabled domains become active only when their `DOMAIN.md` description materially applies and they are named in a Task Context Envelope.
