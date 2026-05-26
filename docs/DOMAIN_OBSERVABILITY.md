# Domain Observability And Validation

This guide explains how to observe and validate Your Legion domain behavior from runtime evidence.

Use it when you need to answer:

- Did the orchestrator choose the correct domain?
- Did a mixed-domain task keep responsibilities separate?
- Did the delegated agent actually read the declared domain refs and skills?
- Did no-domain fallback happen when no domain applies?

## Mental Model

Domain routing is description-driven.

Each enabled domain contributes a `DOMAIN.md` description and declared component paths to the Domain Catalog. The orchestrator compares the task with the Domain Catalog and writes its decision into the Task Context Envelope.

Runtime does not classify domains for the agent. Runtime only records and validates evidence:

- `delegation` event: what the orchestrator declared before delegating.
- `domain-read` event: which declared domain component files the delegated agent actually read.
- `check`: the main acceptance command. It validates static `DOMAIN.md` declarations and runtime trace evidence.
- `trace-check`: low-level trace validation for contract warnings or declared domain refs/skills that were not read.
- `domain-scenario-check`: low-level fixed scenario validation. Prefer `check --scenarios`.

The paper references behind this model are summarized in [`academic-papers-summary.md`](./academic-papers-summary.md): Gorilla for description-driven selection, ReAct for explicit action/evidence loops, and trace-based assurance for contract validation and regression evidence. The same document also marks Themis and PERSONA as future/analogy references rather than implemented claims.

If no domain is configured, or no enabled domain description clearly matches the task, the expected behavior is no-domain delegation:

```text
Active domains: none
Domain refs: none
Domain skills: none
```

## Prerequisites

Install the plugin with the domains you want to validate.

For the full bundled scenario set:

```bash
bunx @whchi/your-legion install --domains coding,marketing,finance,accounting
```

Restart OpenCode after installation so the plugin config hook reloads `legionaries.yaml`.

> **NOTICE:** In Your Legion CLI commands, `--worktree` means the OpenCode workspace/project path used to key trace evidence. It does not require a Git worktree.

Run OpenCode in the same workspace/project path you will pass to the validation commands. The trace file is keyed by that resolved path, so this matters.

## Inspect Available Domain Catalog

Domain packs live in:

```text
~/.config/opencode/your-legion/domains/<domain-id>/
```

The installer materializes enabled bundled domains into this directory when they do not have `DOMAIN.md`. For example, `bunx @whchi/your-legion install` writes `~/.config/opencode/your-legion/domains/coding/` because `coding` is enabled by default. Existing global domain folders with `DOMAIN.md` are preserved and not overwritten.

Bundled domains are also copied into the package and used when no global domain with the same id exists, such as manual config setups that skipped the installer.

`DOMAIN.md` is the source of truth. It should contain:

```md
Workflows:
- `workflows/example-workflow.md`

Decisions:
- `decisions/example-decision.md`

Examples:
- `examples/example-output.md`

Skills:
- `skills/example-skill/SKILL.md`
```

Paths are relative to the domain root. If a path is not listed in `DOMAIN.md`, runtime treats it as absent even if the file exists.

## Observe Recent Domain Evidence

After asking OpenCode to perform a task, inspect the latest trace events:

```bash
bunx @whchi/your-legion trace --worktree . --limit 20
```

For source checkout development, use:

```bash
bun src/cli.ts trace --worktree . --limit 20
```

Trace files are stored under:

```text
~/.config/opencode/your-legion/traces/<worktree-hash>.jsonl
```

A good single-domain coding delegation should look like this shape:

```json
{
  "event": "delegation",
  "targetAgent": "builder",
  "activeDomains": [
    { "id": "coding", "responsibility": "implement and verify the code change" }
  ],
  "domainRefs": ["coding/implementation-loop"],
  "domainSkills": ["coding/make-code-change"],
  "warnings": []
}
```

A good skill-read event should follow in the same session or delegation:

```json
{
  "event": "domain-read",
  "domainRefs": [],
  "domainSkills": ["coding/make-code-change"],
  "warnings": []
}
```

For mixed-domain work, `activeDomains` must contain one entry per domain with a concrete responsibility:

```json
{
  "activeDomains": [
    { "id": "coding", "responsibility": "implement launch UI" },
    { "id": "marketing", "responsibility": "write launch copy" }
  ],
  "domainSkills": ["coding/make-code-change", "marketing/campaign-brief"]
}
```

This is intentionally stricter than `coding, marketing`. A mixed-domain delegation without responsibilities should produce a warning.

## Run Main Acceptance Check

Use `check` after one or more real tasks:

```bash
bunx @whchi/your-legion check --worktree .
```

Source checkout form:

```bash
bun src/cli.ts check --worktree .
```

Passing output:

```text
Your Legion check

Static domain catalog: PASS
Runtime trace: PASS
Scenario evidence: SKIPPED

Summary:
- Sections: 2 passed, 0 failed, 1 skipped
- Findings: 0 failures, 1 warning

Warnings:
- Use --scenarios after running prompts from domain-scenarios.

Your Legion check passed
```

`check` validates `DOMAIN.md` declarations and runtime trace evidence. It exits non-zero when static domain paths are wrong, trace contract warnings exist, or declared domain refs/skills were not read.

## Run Runtime Trace Check

Use `trace-check` only when you want the low-level runtime trace check without static domain validation:

```bash
bunx @whchi/your-legion trace-check --worktree .
```

Source checkout form:

```bash
bun src/cli.ts trace-check --worktree .
```

Passing output:

```text
Domain usage trace check passed
```

Failure examples:

```text
delegation: unknown active domain: sales
delegation: unknown domain skill: coding/missing-skill
delegation: active domain must include responsibility: coding
delegation: declared domain ref was not read: coding/implementation-loop
delegation: declared domain skill was not read: marketing/campaign-brief
```

`trace-check` is the lower-level answer to "did it actually use the declared domain context?" A delegation that declares `Domain refs: coding/implementation-loop` or `Domain skills: marketing/campaign-brief` is not accepted unless a matching `domain-read` event appears.

## Run Fixed Scenario Validation

Use the scenario commands when you want a repeatable acceptance test instead of ad hoc prompts.

Print the fixed prompts:

```bash
bunx @whchi/your-legion domain-scenarios
```

Source checkout form:

```bash
bun src/cli.ts domain-scenarios
```

Copy each printed scenario prompt into OpenCode. Keep the `Scenario: <id>` line in the prompt. That marker is how `check --scenarios` associates trace evidence with the scenario.

Then validate:

```bash
bunx @whchi/your-legion check --worktree . --scenarios
```

Source checkout form:

```bash
bun src/cli.ts check --worktree . --scenarios
```

The fixed set validates:

- `no-domain-no-catalog`
- `no-domain-ambiguous`
- `coding-only`
- `marketing-only`
- `coding-marketing`
- `finance-only`
- `accounting-only`
- `coding-finance`
- `coding-accounting`
- `accounting-finance`
- `finance-marketing`

Passing output:

```text
PASS no-domain-no-catalog
PASS no-domain-ambiguous
PASS coding-only
PASS marketing-only
PASS coding-marketing
PASS finance-only
PASS accounting-only
PASS coding-finance
PASS coding-accounting
PASS accounting-finance
PASS finance-marketing
Domain scenario check passed
```

Failure output means the required delegation evidence was not found:

```text
FAIL coding-only
missing scenario evidence: coding-only
```

Common causes:

- The scenario prompt was not actually run in OpenCode.
- The `Scenario: <id>` line was removed.
- OpenCode was running in a different workspace/project path than `--worktree`.
- The needed domains were not enabled in `legionaries.yaml`.
- The orchestrator delegated without the expected `Active domains`, `Domain refs`, or `Domain skills`.
- The delegation produced contract warnings.

## What To Check Manually

When validating a trace by eye, check these fields first:

| Question | Evidence |
|---|---|
| Did it choose the correct domain? | `delegation.activeDomains[].id` |
| Did it separate mixed-domain work? | each active domain has its own `responsibility` |
| Did it request the expected workflow or decision? | `delegation.domainRefs` |
| Did it request the expected domain skill? | `delegation.domainSkills` |
| Did it actually read the skill file? | matching `domain-read.domainSkills` |
| Did no-domain fallback happen? | empty `activeDomains`, `domainRefs`, and `domainSkills` |
| Was the contract clean? | `warnings: []` and `check` passes |

## CI Or Local Regression Use

For local development:

```bash
bun src/cli.ts domain-scenarios
# Run every printed prompt in OpenCode.
bun src/cli.ts check --worktree . --scenarios
```

For installed package validation:

```bash
bunx @whchi/your-legion domain-scenarios
# Run every printed prompt in OpenCode.
bunx @whchi/your-legion check --worktree . --scenarios
```

`check` exits non-zero on failure, so it can be used in scripted acceptance flows after the interactive OpenCode prompts have produced trace evidence.

## Limitations

- Runtime warnings are warn-only during normal OpenCode execution.
- The runtime observes `task` delegation prompts and `read` tool access to declared domain component paths.
- `check` verifies declared domain refs and skills were read. It does not prove the model followed the referenced document perfectly.
- `check --scenarios` checks fixed scenario evidence. It does not replace reviewing the actual output quality.
- Trace events are keyed by resolved workspace/project path. Always pass the same `--worktree` path that OpenCode used.
