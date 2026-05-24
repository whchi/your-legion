# Development

This document covers repository development for `your-legion`. User-facing installation and configuration instructions live in [`README.md`](../README.md).

## Plugin-First Runtime

- OpenCode loads the published package from the `plugin` array.
- `src/index.ts` registers a server hook that mutates OpenCode config in place.
- `src/config/legionaries.ts` reads and validates the global runtime `legionaries.yaml`.
- `src/runtime/agent-definition-provider.ts` loads protected system agent factories and YAML custom agents.
- `src/runtime/build-agent-config.ts` merges model maps with agent providers.
- `src/runtime/domain-packs.ts` resolves `DOMAIN.md`-declared domain packs and builds the Domain Catalog.
- The plugin injects `default_agent` and the full `agent` map at startup.

No frontmatter rewrite step is required.

## File Layout

```text
.
├── src/
│   ├── agents/
│   ├── config/
│   ├── runtime/
│   └── shared/
├── tests/
├── legionaries.yaml
├── opencode.json
├── README.md
├── docs/
├── AGENTS.md
└── temp/
```

## Local Development

- Install dependencies with `bun install`.
- Run tests with `bun test`.
- Build the published plugin entrypoint with `bun run build`.
- Temporary test artifacts belong under `temp/`, which is gitignored.

## Domain Scenario Validation

Use the fixed scenario set when changing routing prompts, domain packs, the Task Context Envelope, or domain usage tracing.

The full scenario set expects `coding`, `marketing`, `finance`, and `accounting` to be enabled in `legionaries.yaml`. The installer enables only `coding` by default. For a fresh install that can run all scenarios:

```bash
bun src/cli.ts install --domains coding,marketing,finance,accounting
```

From the repo checkout, use the source CLI directly:

```bash
bun src/cli.ts domain-scenarios
```

If the package has already been built and installed, the equivalent installed command is:

```bash
bunx @whchi/your-legion domain-scenarios
```

> **NOTICE:** In Your Legion CLI commands, `--worktree` means the OpenCode workspace/project path used to key trace evidence. It does not require a Git worktree.

Copy each printed scenario prompt into an OpenCode session that has this plugin loaded for the same workspace/project path. Each prompt includes a `Scenario: <id>` marker; keep that marker in the prompt so the runtime trace can associate the delegation with the fixed scenario.

After running all prompts, validate the recorded trace from the repo checkout:

```bash
bun src/cli.ts check --worktree . --scenarios
```

The equivalent installed command is:

```bash
bunx @whchi/your-legion check --worktree . --scenarios
```

If you are validating a different workspace/project path or config directory, pass both paths explicitly:

```bash
bun src/cli.ts check --worktree /path/to/workspace --config-dir ~/.config/opencode --scenarios
```

Full local flow:

```bash
bun src/cli.ts domain-scenarios
# Paste and run every printed scenario prompt in OpenCode.
bun src/cli.ts check --worktree . --scenarios
```

Lower-level trace inspection:

```bash
bun src/cli.ts check --worktree .
bun src/cli.ts trace --worktree . --limit 20
bun src/cli.ts trace-check --worktree .
```

The check expects these scenarios to have matching `delegation` evidence with no contract warnings:

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

## Domain Pack Development

Domain routing is description-driven. `DOMAIN.md` is the only domain description and component catalog used in the Domain Catalog. Domain component folders are optional capability facets. Do not scaffold all four folders unless the domain actually has all four kinds of knowledge. Runtime only includes component paths listed in `DOMAIN.md`; folders or files that are not listed are treated as absent.

Create a domain manifest and routing description:

```bash
bun src/cli.ts create-domain marketing-ops --config-dir /tmp/opencode
```

`create-domain` is intentionally new-only. It must fail for an existing global domain directory and for bundled domain ids.

Create selected component folders and matching placeholder files:

```bash
bun src/cli.ts create-domain marketing-ops --config-dir /tmp/opencode --components decisions,skills
```

The installed package form is the same command without `bun src/cli.ts`:

```bash
bunx @whchi/your-legion create-domain marketing-ops --components workflows,decisions,examples,skills
```

Create and immediately enable a domain in an installed config:

```bash
bunx @whchi/your-legion create-domain marketing-ops --components decisions,skills --enable
```

Component meanings:

| Component | Use for |
|-----------|---------|
| `decisions` | Constraints, guardrails, policies, and stable domain decisions |
| `workflows` | Repeatable ways of doing domain work |
| `examples` | Concrete prior artifacts, edge cases, and output patterns |
| `skills` | Domain-local instructions that agents should deliberately read and follow |

An enabled domain with no discovered components is allowed, but runtime evidence will warn when an agent uses it as active task context. That warning is intentional: it keeps placeholder domains from looking like validated knowledge boundaries.

If no domain is configured, or no enabled domain description clearly matches a task, the expected delegation is:

```text
Active domains: none
Domain refs: none
Domain skills: none
```

That no-domain fallback is normal behavior and should not produce a warning.

## Customization

- Edit `src/agents/*.ts` to change system prompts, permissions, descriptions, or modes.
- Edit the global `legionaries.yaml`, or pass `LEGIONARIES_CONFIG`, when testing runtime provider maps, per-agent models, reasoning settings, custom-agent enablement, and domain enablement. The repo `legionaries.yaml` is the installer template and a test fixture.
- Add custom agents under `src/custom-agents/*.yaml`, then add a matching `custom_agents` mapping.
- Add domain packs under `~/.config/opencode/your-legion/domains/<domain-id>/`, then enable them with `domains.<domain-id>: true`.
- Use `domains.<domain-id>.<component>.<id>.path` only when a component id already listed in `DOMAIN.md` needs to be mounted from another path.
- Built-in domain packs live under `src/domains/` and are copied to `dist/domains` by `bun run build`.
- Domain usage evidence is implemented in `src/runtime/domain-usage-contract.ts`; update parser, trace, and CLI tests when changing the envelope contract.
- Add a new required agent by updating `src/agents/`, `src/agents/index.ts`, `src/shared/agent-types.ts`, `legionaries.yaml`, and the routing guidance in `src/agents/orchestrator.ts`.
- Add a new optional agent by registering it in `src/shared/agent-types.ts` and `src/agents/index.ts`, then documenting the optional `legionaries.yaml` mapping.
- Do not use a system agent name for a custom agent. The runtime fails startup if a custom agent attempts to replace a system agent.

## Routing Contract

Your Legion uses direct specialist routing rather than a category-first runtime.

- The `orchestrator` performs turn-local intent clarification to choose one concrete subagent.
- The `orchestrator` asks the user for missing intent details when needed; it does not inspect repo files to make execution context for another agent.
- These intents are routing heuristics only. They are not runtime categories, model aliases, or execution profiles.
- Multi-step work should go through `planner` first when sequencing is unclear, then `builder` executes approved implementation work.
- Clear execution work goes directly to `builder`; `builder` gathers any needed repo context, runs commands, edits, and verifies.
- `planner`, `builder`, `explorer`, and `librarian` are leaf specialists.
- Leaf specialists should not orchestrate other leaf specialists.
- `planner` is runtime-limited to `docs/**/*.md` edits; code changes belong to `builder`.
- Code review is command-owned by `/code-review` by default; `code-reviewer` is the bundled YAML custom-agent example.
- Global `legionaries.yaml` configures per-agent models, reasoning, custom-agent enablement, and enabled domain packs. It does not decide which system agent gets selected.
- Domain packs add a shared Domain Catalog and namespaced domain skills to existing agents. They do not create new agents, and their skills are not registered with the harness skill resolver.
- Runtime trace events make domain usage observable. `delegation` events show requested active domains, refs, and skills; `domain-read` events show which domain component paths were read. `check` fails when `DOMAIN.md` declarations are invalid, a delegation declares unknown domain evidence, or declared domain refs/skills are not read.
- Fixed acceptance scenarios live with the domain usage contract and cover coding, marketing, finance, accounting, and mixed-domain pairs.

## Routing Boundaries

- `builder` owns implementation and execution work, including backend, frontend, tests, config, refactors, accessibility, UI interaction quality, analysis, copy, and structured reviews.
- `explorer` owns requested discovery over known repo or local files; it is not a context pre-reader for `builder`.
- `librarian` owns requested discovery over third-party documentation, API confirmation, package behavior, and version-specific external references.
- `orchestrator` vs `planner`: `orchestrator` handles turn-local routing; `planner` handles decomposition and implementation plans when work needs sequencing.

## Related Docs

- `AGENTS.md`: plugin internals and runtime architecture
- `docs/DOMAIN_OBSERVABILITY.md`: runtime domain evidence and fixed scenario validation
- `docs/academic-papers-summary.md`: paper references and claim boundaries for domain routing and runtime evidence
