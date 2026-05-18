---
name: make-code-change
description: Make focused code changes with repository inspection, behavior-first tests, conventional implementation, and honest verification. Use when a domain task requires editing code, tests, config, or code-coupled docs.
---

# Make Code Change

Use this domain skill when the task needs a code, test, config, or code-coupled documentation change.

## Quick Start

Read the relevant coding workflow, inspect the existing public surface and callers, write the failing behavior check, implement the smallest conventional change, then verify and report honestly.

## Workflow

1. Restate the intended behavior in one sentence.
2. Inspect the file exports, public surface, immediate callers, nearby helpers, and existing tests.
3. Add or update one focused behavior test before production code when behavior changes.
4. Run the focused test and confirm it fails for the expected reason.
5. Implement the smallest change that makes the test pass.
6. Run the focused test, then the relevant broader check.
7. Report changed files, verification results, skipped checks, assumptions, and remaining risk.

## Boundaries

- Do not invent unrelated features or abstractions.
- Do not refactor unrelated code.
- Do not use harness-level skills as substitutes for this domain skill unless the user explicitly asks.
- Stop and ask when correctness, data safety, public API behavior, or destructive operations are unclear.
