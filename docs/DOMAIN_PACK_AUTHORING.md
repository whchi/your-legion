# Domain Pack Authoring

Domain Packs let users add project or professional knowledge that Your Legion agents can use only when a task actually needs it. They are for selective context, not for building a second agent system.

## What A Domain Pack Does

A domain pack contributes two things:

- a short routing description in `DOMAIN.md`;
- optional component files listed from `DOMAIN.md`.

The orchestrator uses the routing description to decide whether the domain is active for a delegation. The delegated specialist then reads the declared refs or skills that appear in the Task Context Envelope. Runtime trace evidence records the delegation and matching domain reads.

## Start Small

Create a domain with only `DOMAIN.md` first:

```bash
bunx @whchi/your-legion create-domain revenue-ops
```

Add component folders only when the domain has real versioned knowledge:

```bash
bunx @whchi/your-legion create-domain revenue-ops --components decisions,skills
```

The component folders are optional facets:

| Facet | Use For |
| --- | --- |
| `workflows` | Repeatable procedures or review loops |
| `decisions` | Constraints, guardrails, policies, or tradeoffs |
| `examples` | Accepted output patterns or representative examples |
| `skills` | Domain-specific procedures that need skill-style instructions |

Do not create empty folders for symmetry. If a file is not listed in `DOMAIN.md`, runtime treats it as absent even when it exists on disk.

## Write `DOMAIN.md`

Keep the routing description semantic. Describe responsibility, not keyword triggers.

Good:

```md
# revenue-ops Domain

## Routing Description

Use this domain when the task involves revenue recognition policy, quote-to-cash handoff, pricing approval, or sales operations controls.

Do not use this domain when the task only asks for general marketing copy, product UI changes, or unrelated engineering implementation.

## Component Catalog

Decisions:
- `decisions/revenue-recognition-guardrails.md`

Skills:
- `skills/revenue-review/SKILL.md`
```

Avoid:

```md
Use this domain when the prompt contains "revenue", "sales", or "price".
```

Keyword trigger rules make routing brittle. A nearby task may mention a word without needing the domain.

## Component Rules

- Paths are relative to the domain root.
- List only files that exist.
- Use the standard headings `Workflows`, `Decisions`, `Examples`, and `Skills`.
- Keep files small enough for a specialist to read intentionally.
- Put stable expert knowledge in components; keep one-off task details in the user prompt.

## Verify Usage

After using the domain in OpenCode, run:

```bash
bunx @whchi/your-legion doctor --worktree .
```

Use scenarios when validating a full install:

```bash
bunx @whchi/your-legion domain-scenarios
bunx @whchi/your-legion doctor --worktree . --scenarios
```

The important questions are:

- Did the orchestrator choose the expected agent?
- Did it activate the expected domain?
- Did it declare the expected domain refs or skills?
- Did the specialist actually read them?
- Did trace/doctor report warnings that need attention?
