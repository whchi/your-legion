# Legion Loops

Legion Loop is Your Legion's workflow for recurring or goal-driven agent work. It turns Loop Engineering into a governed path: pick a preset, generate a run prompt, keep durable state, and verify completion with maker/checker evidence.

## Quick Start

Create a loop from a preset:

```bash
bunx @whchi/your-legion create-loop daily-ci-triage --preset ci-triage --worktree .
```

Generate the prompt for the next run:

```bash
bunx @whchi/your-legion loop-prompt daily-ci-triage --worktree .
```

Paste the generated Task Context Envelope into OpenCode. After the agents run, inspect the ledger and diagnostics:

```bash
bunx @whchi/your-legion loop-runs --worktree . --loop daily-ci-triage
bunx @whchi/your-legion doctor --worktree .
```

For source checkout development, use `bun src/cli.ts ...` instead of `bunx @whchi/your-legion ...`.

## Presets

Presets are shortcuts for common loop shapes. They create the same `legionaries.yaml` structure as a hand-written loop, but they keep first-time setup small.

List available presets:

```bash
bunx @whchi/your-legion loop-presets
```

Available presets:

| Preset | Use for | Default trigger | Default verification |
|--------|---------|-----------------|----------------------|
| `basic` | A manual maker/checker loop with minimal assumptions | `manual` | `bun test` |
| `ci-triage` | Recurring CI failure triage and verified fixes | `scheduled`, `daily` | `bun test` |
| `issue-triage` | Issue intake, actionable diagnosis, and safe fixes | `external` | `bun test` |
| `docs-refresh` | Keeping docs aligned with current behavior | `manual` | `bun test` |
| `release-check` | Release readiness checks before publishing | `manual` | `bun test`, `bun run build`, `git diff --check` |

Override preset text or checks when creating a loop:

```bash
bunx @whchi/your-legion create-loop release-readiness \
  --preset release-check \
  --description "Weekly release readiness" \
  --objective "Verify release safety and record blockers" \
  --verification "bun test,bun run build,git diff --check"
```

Presets that use coding evidence add `coding/implementation-loop` and `coding/make-code-change` only when the `coding` domain is enabled. If `coding` is not enabled, the loop still works, but it starts with no domain refs or skills.

## Inspect Results

`loop-runs` groups runtime evidence by `Loop` and `Loop run`:

```bash
bunx @whchi/your-legion loop-runs --worktree .
```

Typical output:

```text
Loop run daily-ci-triage-20260520-001
- Loop: daily-ci-triage
- Statuses: maker-complete, verifier-complete
- Targets: builder, verifier
- Verification outcome: passed
- Verification commands: bun test, bun run build
- Completion claim: No findings after checking diff and tests.
```

Run `doctor` when you want setup and evidence diagnostics:

```bash
bunx @whchi/your-legion doctor --worktree .
```

## Generated Config Reference

Presets write ordinary loop config into the global `legionaries.yaml`. You normally create this with `create-loop --preset`, then edit only the fields that need project-specific tuning:

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

`inbox_path` is repo-relative. It is the human-readable memory for findings, attempted work, verification status, and unresolved human decisions.

## Parameter Reference

`description`: Short human-readable label shown in loop listings and diagnostics. Use one sentence.

`objective`: The durable goal of the loop. This should describe the outcome, not one run's temporary task.

`trigger.type`: How the loop is expected to be started. Valid values are `manual`, `scheduled`, and `external`.

`trigger.cadence`: Required when `trigger.type` is `scheduled`. Use a simple operator-facing cadence such as `daily`, `weekly`, or `weekdays`.

`inbox_path`: Repo-relative Markdown file used as the loop's durable state. It should hold current status, findings, unresolved human questions, and run notes.

`active_domains`: Optional default domain responsibilities for this loop. Each entry should include `id` and `responsibility`, for example `{ id: coding, responsibility: triage CI failures }`.

`domain_refs`: Optional Domain Catalog workflow, decision, or example ids the agent should read for loop work, such as `coding/implementation-loop`.

`domain_skills`: Optional Domain Catalog skill ids the agent should read for loop work, such as `coding/make-code-change`.

`agents.triage`: Agent that should plan or decompose unclear loop work. Default presets use `planner`.

`agents.maker`: Agent that should execute the work and produce a maker completion claim. Default presets use `builder`.

`agents.verifier`: Agent that should independently check the maker completion claim. Default presets use `verifier`.

`worktree.isolation`: Worktree safety expectation for the loop. `required` means code-touching loop work should use isolated work when practical.

`verification.commands`: Commands that prove the loop's completion claim. Keep this list small and meaningful; examples are `bun test`, `bun run build`, and `git diff --check`.

`verification.completion`: Human-readable completion rule. This explains what must be true before the loop can be considered complete.

`connectors.mode`: How external systems are wired. `manual` means humans or external scripts start the loop. Future connector modes can integrate CI, issue trackers, or schedulers.

`connectors.targets`: External systems or resources associated with the loop. Keep it empty for manual loops; use explicit target names or URLs when external tooling consumes this metadata.

## Agent Flow

When a task matches a configured loop, the orchestrator includes the loop id and run id in the Task Context Envelope. You normally generate this with `loop-prompt` instead of writing it by hand:

```text
Task Context Envelope:
Scenario: none
Loop: daily-ci-triage
Loop run: daily-ci-triage-20260520-001
Loop status: started
Objective: Fix the actionable CI failure and verify it.
Active domains: coding: implement and verify the code change
Domain refs: coding/implementation-loop
Domain skills: coding/make-code-change
Context refs: docs/legion-loops/daily-ci-triage.md
Constraints: Use required worktree isolation when the loop touches code or long-running state.
Expected output: Patch or findings, updated loop inbox, verification results, and a Loop Run Report.
Verification: bun test, bun run build, git diff --check
Completion claim: none
Verification commands: none
Verification outcome: none
```

`builder` is the maker. `verifier` is the checker. The checker should review the completion claim, diff, tests, loop inbox, and declared domain evidence before the loop is considered complete.

## Loop Run Reports

Each attempt of a loop should keep one `Loop run` id across maker and verifier delegations. The maker and checker both return a parseable report:

```text
Loop Run Report:
Loop: daily-ci-triage
Loop run: daily-ci-triage-20260520-001
Loop status: maker-complete
Completion claim: Fixed the actionable CI failure and updated tests.
Verification commands: bun test, bun run build, git diff --check
Verification outcome: passed
```

Valid statuses are `started`, `maker-complete`, `verifier-complete`, `blocked`, and `failed`. Valid verification outcomes are `passed`, `failed`, `not-run`, and `unknown`.

Your Legion records these reports in the runtime trace as `loop-run-report` events. A run is not trusted as complete until a `maker-complete` report has matching `verifier-complete` evidence for the same `Loop` and `Loop run`.

## What Doctor Checks

- The loop inbox exists at the configured repo-relative path.
- Maker and verifier are separate agents.
- Verification commands are present.
- Declared loop domain refs and skills exist in the enabled Domain Catalog.
- Runtime loop delegations reference known loops.
- A maker delegation for a loop has matching verifier evidence before completion is trusted.
- A `maker-complete` loop run has a matching `verifier-complete` report for the same run id.
- A `verifier-complete` loop run includes a passed verification outcome.

## Non-Goals

- No built-in scheduler or daemon.
- No automatic GitHub, Linear, Slack, or CI mutation. Connectors are declared as a contract and can be wired by external tooling later.
- No replacement for human engineering judgment. The loop records and verifies work; it does not remove review responsibility.
