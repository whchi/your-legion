# Legion Loops

Legion Loop is Your Legion's contract for recurring or goal-driven agent work. It turns Loop Engineering into a governed workflow: define the objective once, route work through bounded agents, keep durable state, and verify completion with evidence.

The first implementation is contract-first. Your Legion does not run a scheduler itself yet. Use OpenCode, cron, CI, hooks, or a human prompt to start work, and use the loop contract to keep the agents and diagnostics aligned.

## Config Shape

Loops live in the global `legionaries.yaml`:

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

## Agent Flow

When a task matches a configured loop, the orchestrator includes the loop id in the Task Context Envelope:

```text
Task Context Envelope:
- Scenario: none
- Loop: daily-ci-triage
- Objective: Fix the actionable CI failure and verify it.
- Active domains: coding: implement and verify the code change
- Domain refs: coding/implementation-loop
- Domain skills: coding/make-code-change
- Context refs: docs/legion-loops/daily-ci-triage.md
- Constraints: Use an isolated worktree when running parallel work.
- Expected output: Patch, verification, and loop inbox update.
- Verification: bun test, bun run build, git diff --check
```

`builder` is the maker. `verifier` is the checker. The checker should review the completion claim, diff, tests, loop inbox, and declared domain evidence before the loop is considered complete.

## Commands

Create a loop contract and inbox:

```bash
bunx @whchi/your-legion create-loop daily-ci-triage --worktree . --description "Daily CI triage" --objective "Find and verify CI fixes"
```

List configured loops:

```bash
bunx @whchi/your-legion loops
```

Validate loop catalog and runtime evidence:

```bash
bunx @whchi/your-legion doctor --worktree .
```

Run fixed loop scenario prompts, then validate evidence:

```bash
bunx @whchi/your-legion loop-scenarios
bunx @whchi/your-legion doctor --worktree . --loop-scenarios
```

## What Doctor Checks

- The loop inbox exists at the configured repo-relative path.
- Maker and verifier are separate agents.
- Verification commands are present.
- Declared loop domain refs and skills exist in the enabled Domain Catalog.
- Runtime loop delegations reference known loops.
- A maker delegation for a loop has matching verifier evidence before completion is trusted.

## Non-Goals

- No built-in scheduler or daemon in the first version.
- No automatic GitHub, Linear, Slack, or CI mutation. Connectors are declared as a contract and can be wired by external tooling later.
- No replacement for human engineering judgment. The loop records and verifies work; it does not remove review responsibility.
