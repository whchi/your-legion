# Development

This document covers repository development for `your-legion`. User-facing installation and configuration instructions live in [`README.md`](../README.md). Architecture direction lives in [`ADR 0001`](./adr/0001-plugin-first-domain-aware-orchestration.md) and [`ADR 0002`](./adr/0002-legion-loop-contract.md), the current product plan lives in [`ROADMAP.md`](./ROADMAP.md), and user-facing domain/loop guidance lives in [`DOMAIN_PACK_AUTHORING.md`](./DOMAIN_PACK_AUTHORING.md) and [`LEGION_LOOPS.md`](./LEGION_LOOPS.md).

## Plugin-First Runtime

- OpenCode loads the published package from the `plugin` array.
- `src/index.ts` registers a server hook that mutates OpenCode config in place.
- `src/config/legionaries.ts` reads and validates the global runtime `legionaries.yaml`.
- `src/runtime/agent-definition-provider.ts` loads protected system agent factories and YAML custom agents.
- `src/runtime/build-agent-config.ts` merges model maps with agent providers.
- `src/runtime/domain-packs.ts` resolves `DOMAIN.md`-declared domain packs and builds the Domain Catalog.
- `src/runtime/loop-catalog.ts` formats configured Legion Loops into the Loop Catalog.
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
- Build the local plugin entrypoint with `bun run build`.
- Temporary test artifacts belong under `temp/`, which is gitignored.

For a normal code change, use this loop:

```bash
bun install
bun test
bun run build
```

`bun run build` writes the local OpenCode plugin entrypoint to `dist/server.js` and the local CLI to `dist/cli.js`. OpenCode does not load TypeScript source directly.

## Local OpenCode Smoke Test

Use this flow when you need to confirm the current checkout works inside OpenCode.

1. Build the local plugin:

```bash
bun run build
```

2. Make sure OpenCode can read a Your Legion runtime config. For local development, the simplest path is to install the config and bundled domains from the source CLI:

```bash
bun src/cli.ts install --domains coding,marketing,finance,accounting
```

This writes `~/.config/opencode/legionaries.yaml` and materializes bundled domain packs under `~/.config/opencode/your-legion/domains/`.

3. Load the local build in the project OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["dist/server.js"]
}
```

Use the local `dist/server.js` entry when testing this checkout. Using `bunx @whchi/your-legion ...` or `plugin: ["@whchi/your-legion"]` tests the published package path, not necessarily the local source you just changed. For a clean source test, the effective OpenCode plugin list should include `dist/server.js` and should not also include `@whchi/your-legion`.

4. Restart OpenCode from the repo root after rebuilding or changing config:

```bash
opencode
```

For a one-off non-interactive smoke test, run OpenCode from the repo root:

```bash
opencode run --agent orchestrator "Explore where Your Legion builds the runtime agent config."
```

5. Ask a small routing smoke-test prompt:

```text
Explore where Your Legion builds the runtime agent config.
```

The expected path is `orchestrator -> explorer`, because this is repo discovery. Then ask a small execution prompt:

```text
Review the README introduction and suggest one wording improvement without editing files.
```

The expected path is `orchestrator -> builder`, because this is a concrete execution task and `builder` owns analysis/copy work.

6. Inspect recorded evidence:

```bash
bun src/cli.ts trace --worktree . --limit 20
bun src/cli.ts doctor --worktree .
```

`--worktree .` must match the workspace/project path used by OpenCode. If you opened OpenCode from another directory, pass that absolute path instead.

### Isolated OpenCode Config

Use an isolated config when measuring benchmarks or when global OpenCode plugins/MCP servers would contaminate the tool surface.

```bash
XDG_CONFIG_HOME=/private/tmp/your-legion-opencode-dev bun src/cli.ts install --domains coding,marketing,finance,accounting
```

Then start OpenCode with the same `XDG_CONFIG_HOME` and a project config that loads `dist/server.js`:

```bash
XDG_CONFIG_HOME=/private/tmp/your-legion-opencode-dev opencode
```

Your Legion resolves its default config from `XDG_CONFIG_HOME/opencode/legionaries.yaml`. Use `LEGIONARIES_CONFIG=/absolute/path/to/legionaries.yaml` only when you intentionally want a different model/domain config.

Common local-development mistakes:

- Forgetting to run `bun run build` after changing `src/`; OpenCode loads `dist/server.js`.
- Testing `@whchi/your-legion` through `bunx` or the package plugin name when you meant to test the local checkout.
- Editing the repo `legionaries.yaml` and expecting OpenCode to use it automatically. Runtime reads the global OpenCode config unless `LEGIONARIES_CONFIG` is set.
- Running trace checks with a different `--worktree` path than the OpenCode workspace path.
- Leaving unrelated global plugins or MCP servers enabled while trying to measure routing/token behavior.

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
bun src/cli.ts doctor --worktree . --scenarios
```

The equivalent installed command is:

```bash
bunx @whchi/your-legion doctor --worktree . --scenarios
```

If you are validating a different workspace/project path or config directory, pass both paths explicitly:

```bash
bun src/cli.ts doctor --worktree /path/to/workspace --config-dir ~/.config/opencode --scenarios
```

Full local flow:

```bash
bun src/cli.ts domain-scenarios
# Paste and run every printed scenario prompt in OpenCode.
bun src/cli.ts doctor --worktree . --scenarios
```

Lower-level trace inspection:

```bash
bun src/cli.ts doctor --worktree .
bun src/cli.ts trace --worktree . --limit 20
bun src/cli.ts trace-check --worktree .
```

The doctor expects these scenarios to have matching `delegation` evidence with no contract warnings:

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

## Loop Scenario Validation

Use the fixed loop scenario set when changing Legion Loop prompts, `Loop:` envelope parsing, trace output, or doctor loop diagnostics.

```bash
bun src/cli.ts loop-scenarios
# Paste and run every printed scenario prompt in OpenCode.
bun src/cli.ts doctor --worktree . --loop-scenarios
```

Loop diagnostics also run during ordinary doctor checks:

```bash
bun src/cli.ts doctor --worktree .
```

The doctor validates configured loop inbox files, maker/checker separation, declared loop domain evidence, runtime loop evidence, and fixed loop scenario evidence when `--loop-scenarios` is provided.

## Domain Pack Development

Domain routing is description-driven. `DOMAIN.md` is the only domain description and component catalog used in the Domain Catalog. Domain component folders are optional capability facets. Do not scaffold all four folders unless the domain actually has all four kinds of knowledge. Runtime only includes component paths listed in `DOMAIN.md`; folders or files that are not listed are treated as absent. For the author-facing version of these rules, see [`DOMAIN_PACK_AUTHORING.md`](./DOMAIN_PACK_AUTHORING.md).

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
- Domain and loop usage evidence are implemented in `src/runtime/domain-usage-contract.ts`; update parser, trace, doctor, scenario, and CLI tests when changing the envelope contract.
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
- Runtime trace events make domain usage observable. `delegation` events show requested active domains, refs, and skills; `domain-read` events show which domain component paths were read. `doctor` fails when `DOMAIN.md` declarations are invalid, a delegation declares unknown domain evidence, or declared domain refs/skills are not read; it also reports domain usage stats.
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
