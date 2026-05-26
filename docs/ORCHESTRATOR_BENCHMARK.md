# Orchestrator Benchmark

This document defines how to compare `your-legion` orchestration against OpenCode's native builder path.

The comparison target is:

```text
A. native-builder: OpenCode native work agent directly handles the task
B. your-legion-orchestrated: orchestrator.ts classifies, writes a Task Context Envelope, then delegates
```

Do not compare OpenCode native builder against `your-legion`'s `builder` in isolation. The product question is whether the `orchestrator.ts` layer is worth its full cost.

## Success Claim

The benchmark should only call `your-legion-orchestrated` better when it improves at least one of these without worsening the others:

- lower `tokens_per_pass`
- lower or equal rework turns
- equal or better pass rate
- zero `your-legion` trace warnings
- better review or rubric score for the same task

Token savings alone are not enough when the task fails or needs extra repair turns.

## Metrics

For each OpenCode session row:

```text
total_tokens = tokens_input + tokens_output + tokens_reasoning + tokens_cache_read + tokens_cache_write
context_tokens = tokens_input + tokens_cache_read + tokens_cache_write
```

For each paired task:

```text
native_total = total tokens from the native-builder run
orchestrator_tokens = total tokens from agent = orchestrator
specialist_tokens = total tokens from delegated non-orchestrator sessions
your_legion_total = orchestrator_tokens + specialist_tokens
net_delta = your_legion_total - native_total
net_delta_pct = net_delta / native_total
outcome = quality-plus-token tradeoff label from the reusable summarizer
```

For grouped results:

```text
tokens_per_pass = total_tokens / passed_task_count
```

The reusable summary logic lives in `src/runtime/orchestration-benchmark.ts` and is exported from `src/index.ts`.

The task-level `outcome` label intentionally combines quality and token cost so the benchmark does not collapse into a token-only conclusion:

| outcome | Meaning |
|---|---|
| `cheaper-better` | Your Legion used fewer tokens and passed when native failed |
| `cheaper-same-quality` | Your Legion used fewer tokens and both variants had the same pass/fail result |
| `cheaper-worse` | Your Legion used fewer tokens but failed when native passed |
| `same-cost-better` | Token totals matched and Your Legion passed when native failed |
| `same-cost-same-quality` | Token totals and pass/fail result matched |
| `same-cost-worse` | Token totals matched but Your Legion failed when native passed |
| `more-expensive-better` | Your Legion used more tokens but passed when native failed |
| `more-expensive-not-better` | Your Legion used more tokens and both variants had the same pass/fail result |
| `more-expensive-worse` | Your Legion used more tokens and failed when native passed |
| `incomplete-comparison` | One side of the paired task is missing |

## Controlled Run Protocol

Use the same task prompt twice, once per variant. Keep the same model and workspace path. The default benchmark model is:

```text
opencode-go/deepseek-v4-flash
```

For a same-model orchestrated run, pin both layers:

- pass `--model opencode-go/deepseek-v4-flash` to `opencode run`
- use a benchmark `legionaries.yaml` where `orchestrator`, `builder`, `explorer`, `planner`, and `librarian` all use `opencode-go/deepseek-v4-flash`

Use an isolated benchmark config when measuring routing cost. In local runs, this used a temp `XDG_CONFIG_HOME` and disabled global MCP servers so global OpenCode plugins did not add unrelated tools or context.

Do not benchmark by asking agents to modify repository files. Mutation tasks add edit, verification, and repair noise that overwhelms routing cost. Use read-only tasks unless the benchmark is explicitly measuring execution quality for file changes.

When passing prompts through a shell command, escape literal dollar signs in financial tasks, for example `\$40` and `\$90/hour`. Otherwise the shell may expand `$40` or `$90` before OpenCode receives the prompt, invalidating the run.

Native run:

```bash
opencode run --pure --agent build --model opencode-go/deepseek-v4-flash \
  --title "yl-orchestrator-vs-native-YYYYMMDD coding-001 native-builder" \
  "<prompt>"
```

Prompt shape:

```text
Benchmark: yl-orchestrator-vs-native-YYYYMMDD
Task: coding-001
Variant: native-builder

<the task>
```

Orchestrated run:

```bash
opencode run --agent orchestrator --model opencode-go/deepseek-v4-flash \
  --title "yl-orchestrator-vs-native-YYYYMMDD coding-001 your-legion-orchestrated" \
  "<prompt>"
```

Prompt shape:

```text
Benchmark: yl-orchestrator-vs-native-YYYYMMDD
Task: coding-001
Variant: your-legion-orchestrated

<the same task>
```

Record an outcome row for each task:

```text
task_id, task_type, variant, passed, rework_turns, rubric_score, verification
```

For `your-legion-orchestrated`, also run:

```bash
bun src/cli.ts trace-check --worktree .
bun src/cli.ts check --worktree .
```

When validating domain scenarios, use:

```bash
bun src/cli.ts domain-scenarios
bun src/cli.ts check --worktree . --scenarios
```

## Four-Domain Task Set

These four tasks are the first benchmark prompts to run. They are derived from the bundled domain descriptions under `src/domains/` and are intentionally read-only.

Result status in this section is a dry-run routing result: it records what the orchestrator should declare and what the checker should accept after the prompt is run. It is not a measured token result until both variants are executed in OpenCode with the benchmark marker.

### `coding-001`

Task type: `coding`

Prompt:

```text
Benchmark: yl-orchestrator-vs-native-YYYYMMDD
Task: coding-001
Variant: <native-builder|your-legion-orchestrated>

Review the Task Context Envelope parser and explain whether comma-separated Domain skills are trimmed and parsed as separate refs. Cite the exact functions and tests that support the conclusion. Do not modify files.
```

Expected orchestrated result:

| Field | Expected |
|---|---|
| Target agent | `explorer`, because the requested deliverable is repo-local parser discovery and explanation |
| Active domains | `coding: inspect parser behavior and report verification evidence` |
| Domain refs | `coding/implementation-loop` |
| Domain skills | `coding/make-code-change` |
| Verification | cites parser functions and existing tests; no files changed |
| Dry-run result | expected routing acceptance: PASS; measured token result: pending |

### `marketing-001`

Task type: `marketing`

Prompt:

```text
Benchmark: yl-orchestrator-vs-native-YYYYMMDD
Task: marketing-001
Variant: <native-builder|your-legion-orchestrated>

Draft concise launch copy for a developer tool feature called Domain Catalog. The feature routes tasks to compact domain guidance for coding, marketing, finance, and accounting work. Keep claims concrete and supportable, write for developers and operators, and do not mention benchmark results or token savings. Do not modify files.
```

Expected orchestrated result:

| Field | Expected |
|---|---|
| Target agent | `builder` as the execution specialist |
| Active domains | `marketing: write market-facing launch copy` |
| Domain refs | `marketing/campaign-planning`, `marketing/brand-voice`, or none if the copy is intentionally brief |
| Domain skills | `marketing/campaign-brief` |
| Verification | copy includes audience, core message, final copy, and claim constraints; no benchmark or token-savings claims |
| Dry-run result | expected routing acceptance: PASS; measured token result: pending |

### `finance-001`

Task type: `finance`

Prompt:

```text
Benchmark: yl-orchestrator-vs-native-YYYYMMDD
Task: finance-001
Variant: <native-builder|your-legion-orchestrated>

Analyze a pricing tradeoff for a developer tool that costs $40 per user per month and saves each engineer 2 hours per month. Assume engineer time costs $90/hour fully loaded. Show the break-even point, state assumptions, and list risks or missing data. Do not modify files.
```

Expected orchestrated result:

| Field | Expected |
|---|---|
| Target agent | `builder` as the execution specialist |
| Active domains | `finance: analyze pricing, time-savings, and break-even assumptions` |
| Domain refs | `finance/financial-review`, `finance/financial-guardrails`, or none if the answer is short |
| Domain skills | `finance/financial-analysis` |
| Verification | output separates known inputs, assumptions, analysis, and risks |
| Dry-run result | expected routing acceptance: PASS; measured token result: pending |

### `accounting-001`

Task type: `accounting`

Prompt:

```text
Benchmark: yl-orchestrator-vs-native-YYYYMMDD
Task: accounting-001
Variant: <native-builder|your-legion-orchestrated>

Review the accounting treatment considerations for recording OpenCode token usage costs as internal R&D tooling spend. Discuss recognition timing, classification, cutoff, disclosure considerations, and review risks. Do not give tax advice. Do not modify files.
```

Expected orchestrated result:

| Field | Expected |
|---|---|
| Target agent | `builder` as the execution specialist |
| Active domains | `accounting: review treatment, classification, timing, cutoff, and disclosure considerations` |
| Domain refs | `accounting/accounting-review`, `accounting/accounting-guardrails`, or none if the answer is short |
| Domain skills | `accounting/apply-accounting-review` |
| Verification | output separates accounting question, facts, assumptions, treatment notes, and review risks |
| Dry-run result | expected routing acceptance: PASS; measured token result: pending |

### Dry-Run Summary

| task_id | task_type | expected active domain | expected domain skill | dry-run routing result | measured native result | measured orchestrated result |
|---|---|---|---|---|---|---|
| `coding-001` | coding | `coding` | `coding/make-code-change` | PASS expected | PASS | PASS: direct `explorer` delegation; +135.91% tokens |
| `marketing-001` | marketing | `marketing` | `marketing/campaign-brief` | PASS expected | PASS | PASS: direct `builder` delegation; +395.19% tokens |
| `finance-001` | finance | `finance` | `finance/financial-analysis` | PASS expected | PASS | PASS: direct `builder` delegation after shell-dollar escaping was fixed; +132.58% tokens |
| `accounting-001` | accounting | `accounting` | `accounting/apply-accounting-review` | PASS expected | PASS | PASS: direct `builder` delegation; +8.27% tokens |

Measured same-model results are recorded below. The latest four-task run completed all four tasks, but several domain-envelope fields still produced trace warnings.

## OpenCode Token Extraction

The local OpenCode session DB used for this project is:

```text
~/.local/share/opencode/opencode.db
```

The `session` table has the required token fields:

```text
agent, parent_id, directory, title, cost,
tokens_input, tokens_output, tokens_reasoning,
tokens_cache_read, tokens_cache_write
```

Use the benchmark marker to find controlled runs:

```sql
select
  s.id,
  s.parent_id,
  s.agent,
  s.title,
  s.tokens_input,
  s.tokens_output,
  s.tokens_reasoning,
  s.tokens_cache_read,
  s.tokens_cache_write,
  s.cost
from session s
where s.title like '%yl-orchestrator-vs-native-YYYYMMDD%'
   or exists (
     select 1
     from message m
     where m.session_id = s.id
       and m.data like '%yl-orchestrator-vs-native-YYYYMMDD%'
   )
order by s.time_created;
```

In this local DB, OpenCode's native work path appears as `agent = build`. If another install names the native builder differently, use the agent name from the controlled native run.

For `your-legion-orchestrated`, include every session carrying the same benchmark/task marker. If parent-child links are present, also include delegated child sessions for the orchestrator root.

## Current Local Result

Date: 2026-05-23

### DeepSeek V4 Pro Control Rerun

Benchmark marker:

```text
yl-orchestrator-vs-native-202605231350pro
```

Execution notes:

- Native variant used `opencode run --pure --agent build --model opencode-go/deepseek-v4-pro`.
- Orchestrated variant used `XDG_CONFIG_HOME=/private/tmp/yl-orchestrator-vs-native-202605231350pro/xdg opencode run --agent orchestrator --model opencode-go/deepseek-v4-pro`.
- The isolated `legionaries.yaml` pinned `orchestrator`, `builder`, `explorer`, `planner`, and `librarian` to `opencode-go/deepseek-v4-pro`.
- The four task prompts were independent domain prompts and did not include prior benchmark results as task content.
- `src/agents/orchestrator.ts` no longer names development-environment tools such as `codegraph*`, `context-mode*`, or `ctx_*`. The local OpenCode runtime still exposed `ctx_*` and `codegraph*` tools at execution time; that is environment-level contamination and is recorded below when it affected routing behavior.
- This run happened after the role-boundary and Task Context Envelope prompt updates: `orchestrator` clarifies intent, delegates, and reports; `builder` gathers execution context; `explorer` gathers known repo/local-file facts only when that is the requested deliverable; `Domain refs` and `Domain skills` must be catalog ids only.
- The earlier `deepseek-v4-flash` finance run used an unescaped shell prompt, so `$40` and `$90/hour` were expanded away before reaching OpenCode. That finance failure was a benchmark harness bug, not evidence that the model ignored visible numeric inputs. This control rerun escaped those dollar signs.

Measured comparison:

| task_id | task_type | expected_agent | actual_agent_path | native_total | orchestrator_tokens | specialist_tokens | your_legion_total | net_delta_pct | agent_correct | domain_correct | specialist_read_evidence | completion_score | observed note |
|---|---|---|---|---:|---:|---:|---:|---:|---|---|---|---:|---|
| `coding-001` | coding | `explorer` | `orchestrator+explorer` | 207,458 | 36,594 | 452,826 | 489,420 | +135.91% | PASS | PARTIAL | none | 0.90 | Pro fixed the flash role-boundary failure: `orchestrator` delegated repo-local discovery to `explorer`. The trace still warned because `Active domains` was `coding` without a responsibility. |
| `marketing-001` | marketing | `builder` | `orchestrator+builder` | 24,023 | 35,655 | 83,305 | 118,960 | +395.19% | PASS | PARTIAL | builder read `marketing/brand-voice` and `marketing/launch-copy` via normal read tools; no `domain-read` event was recorded | 0.90 | Direct `builder` delegation. Output met the copy constraints. The envelope used `marketing` as the domain but did not declare the expected `marketing/campaign-brief` skill. |
| `finance-001` | finance | `builder` | `orchestrator+builder` | 24,509 | 35,954 | 21,050 | 57,004 | +132.58% | PASS | FAIL | none | 0.95 | Pro completed the analysis and preserved `$40` and `$90/hour` after shell-dollar escaping was fixed. The TCE malformed `Active domains` as comma-split pseudo-domains such as `finance (pricing analysis`, `break-even`, and `ROI`, producing trace warnings. |
| `accounting-001` | accounting | `builder` | `orchestrator+builder` | 103,325 | 39,815 | 72,050 | 111,865 | +8.27% | PASS | PARTIAL | delegation trace declared `accounting/apply-accounting-review`; no matching `domain-read` event was recorded | 0.95 | Direct `builder` delegation and strong accounting memo. The TCE declared refs/skill correctly, but malformed `Active domains` into multiple unknown ids, producing trace warnings. |

Grouped totals:

| variant | completed_tasks | total_tokens | cost | tokens_per_pass |
|---|---:|---:|---:|---:|
| native-builder | 4 | 359,315 | 0.215392 | 89,828.8 |
| your-legion-orchestrated | 4 | 777,249 | 0.465920 | 194,312.3 |

Interpretation:

- DeepSeek V4 Pro materially improved instruction following versus the flash run: `coding-001` delegated to `explorer`, and `finance-001` delegated to `builder` once the benchmark prompt was escaped correctly.
- This control still does **not** support a token-savings claim. `your-legion-orchestrated` used 417,934 more tokens than native, a +116.31% total-token delta.
- Agent selection was correct on all four tasks: `explorer` for repo-local parser discovery and `builder` for marketing, finance, and accounting execution.
- Domain envelope quality is still unreliable. Three rows had trace warnings from malformed `Active domains`; `finance-001` and `accounting-001` show the model still tends to put responsibilities or comma-separated topics where a single `domain-id: responsibility` entry is required.
- All four `trace-check --worktree <task-worktree>` commands returned pass, even though the trace file contained warnings. In this local run, trace events recorded `worktree: "/"`, so per-worktree `trace-check` did not catch those warnings. This is an observability bug to fix before using trace-check as benchmark acceptance evidence.
- The local runtime still exposed development-environment tools (`ctx_*` / `codegraph*`) even though the plugin source no longer names them. The pro orchestrator did not misuse them on `coding-001`, but native builder sessions still used environment tools. A formal benchmark should run in an environment where these tools are not exposed at all.

## Report Shape

The final comparison table should use this shape:

| task_id | task_type | native_total | orchestrator_tokens | specialist_tokens | your_legion_total | net_delta_pct | outcome | passed_native | passed_your_legion | rework_native | rework_your_legion | trace_warnings |
|---|---|---:|---:|---:|---:|---:|---|---|---|---:|---:|---:|

Only compare `net_delta_pct` within the same `task_type`.

The final outcome summary should use this shape:

| outcome | tasks |
|---|---:|
