import assert from 'node:assert/strict';
import test from 'node:test';
import type { AgentName, PermissionConfig } from '../src/shared/agent-types';

const FORBIDDEN_PROMPT_HOOKS = [
  'better-test-driven-development',
  'testing-strategy',
  'debugging-playbook',
  'debug-triage',
  'build-fix',
  'project-structure-advisor',
  'repository-boundary-review',
  'ddd-fit-check',
  'maintainable-code-review',
];

test('agent registry supports six protected system specialists', async () => {
  const { REQUIRED_AGENT_NAMES, OPTIONAL_AGENT_NAMES } = await import('../src/shared/agent-types');
  const { AGENT_FACTORIES, BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');

  assert.deepEqual(REQUIRED_AGENT_NAMES, ['orchestrator', 'explorer', 'planner', 'builder', 'verifier', 'librarian']);
  assert.deepEqual(OPTIONAL_AGENT_NAMES, []);
  assert.ok(!('dispatcher' in AGENT_FACTORIES));
  assert.ok(!('frontend-developer' in AGENT_FACTORIES));
  assert.ok(!('code-reviewer' in AGENT_FACTORIES));
  assert.ok('verifier' in AGENT_FACTORIES);
  assert.ok(!('dispatcher' in BASE_AGENT_DEFINITIONS));
  assert.ok(!('frontend-developer' in BASE_AGENT_DEFINITIONS));
  assert.ok(!('code-reviewer' in BASE_AGENT_DEFINITIONS));
  assert.ok('verifier' in BASE_AGENT_DEFINITIONS);
});

test('orchestrator prompt includes an intent gate and can delegate to explorer and librarian', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;
  const taskPermission = orchestrator.permission.task as PermissionConfig;

  assert.equal(orchestrator.mode, 'primary');
  assert.equal(taskPermission.explorer, 'allow');
  assert.equal(taskPermission.librarian, 'allow');
  assert.equal(taskPermission.builder, 'allow');
  assert.equal(taskPermission.verifier, 'allow');
  assert.ok(!('dispatcher' in taskPermission));
  assert.ok(!('frontend-developer' in taskPermission));
  assert.ok(!('code-reviewer' in taskPermission));
  assert.match(orchestrator.prompt, /Intent Gate/i);
  assert.match(orchestrator.prompt, /explore/i);
  assert.match(orchestrator.prompt, /docs research|library docs|api references/i);
  assert.doesNotMatch(orchestrator.prompt, /dispatcher/i);
  assert.doesNotMatch(orchestrator.prompt, /frontend-developer/i);
  assert.doesNotMatch(orchestrator.prompt, /code-reviewer/i);
});

test('orchestrator prompt requires a compact task context envelope for delegation', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;

  assert.match(orchestrator.prompt, /Every `task` tool prompt must start with `Task Context Envelope:/i);
  assert.match(orchestrator.prompt, /Task Context Envelope/i);
  assert.match(orchestrator.prompt, /Scenario:/);
  assert.match(orchestrator.prompt, /Loop:/);
  assert.match(orchestrator.prompt, /Objective:/);
  assert.match(orchestrator.prompt, /Active domains:/);
  assert.match(orchestrator.prompt, /Domain refs:/);
  assert.match(orchestrator.prompt, /Domain skills:/);
  assert.match(orchestrator.prompt, /Context refs:/);
  assert.match(orchestrator.prompt, /Constraints:/);
  assert.match(orchestrator.prompt, /Expected output:/);
  assert.match(orchestrator.prompt, /Verification:/);
  assert.match(orchestrator.prompt, /120-180 tokens/);
});

test('orchestrator prompt treats active domains as task-local responsibilities', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;

  assert.match(orchestrator.prompt, /compare the task with the Domain Catalog/i);
  assert.match(orchestrator.prompt, /Activate every domain whose description materially applies/i);
  assert.match(orchestrator.prompt, /If no domain description clearly applies/i);
  assert.match(orchestrator.prompt, /Active domains: none/i);
  assert.match(orchestrator.prompt, /Domain refs: none/i);
  assert.match(orchestrator.prompt, /Domain skills: none/i);
  assert.match(orchestrator.prompt, /coding: implement UI/i);
  assert.match(orchestrator.prompt, /marketing: write launch copy/i);
  assert.match(orchestrator.prompt, /Do not blend domain assumptions/i);
});

test('orchestrator prompt constrains domain evidence fields to catalog ids', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;

  assert.match(orchestrator.prompt, /Active domains.*domain-id: responsibility/i);
  assert.match(orchestrator.prompt, /Domain refs.*catalog ids only/i);
  assert.match(orchestrator.prompt, /Domain skills.*catalog ids only/i);
  assert.match(orchestrator.prompt, /Do not include paths, prose, explanations, or parenthetical notes/i);
  assert.match(orchestrator.prompt, /Domain refs: finance\/financial-review, finance\/financial-guardrails/i);
  assert.match(orchestrator.prompt, /Domain skills: finance\/financial-analysis/i);
});

test('orchestrator prompt keeps every envelope ref field structured', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;

  assert.match(orchestrator.prompt, /Scenario.*marker only when present/i);
  assert.match(orchestrator.prompt, /Context refs.*repo paths, local paths, URLs, or explicit user-provided refs/i);
  assert.match(orchestrator.prompt, /Do not put prose, explanations, summaries, or parenthetical notes in any refs field/i);
});

test('orchestrator prompt treats builder as the execution specialist', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;
  const builder = BASE_AGENT_DEFINITIONS.builder;

  assert.match(builder.description, /execution specialist/i);
  assert.match(builder.prompt, /execution specialist/i);
  assert.match(orchestrator.prompt, /builder.*execution specialist/i);
  assert.match(orchestrator.prompt, /non-code deliverables/i);
});

test('orchestrator prompt avoids execution and handles failed delegation explicitly', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;

  assert.match(orchestrator.prompt, /Do not attempt unavailable tools/i);
  assert.match(orchestrator.prompt, /edit\/bash/i);
  assert.match(orchestrator.prompt, /delegate to `builder` before implementation inspection/i);
  assert.match(orchestrator.prompt, /empty result/i);
  assert.match(orchestrator.prompt, /retry once/i);
  assert.match(orchestrator.prompt, /do not complete executor work yourself/i);
  assert.match(orchestrator.prompt, /Return the delegated specialist's full deliverable/i);
  assert.match(orchestrator.prompt, /Do not replace the deliverable with a summary/i);
});

test('orchestrator prompt defines routing as intent clarification and delegation only', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;

  assert.match(orchestrator.prompt, /primary responsibilities are intent clarification, delegation, and final reporting/i);
  assert.match(orchestrator.prompt, /interact with the user until intent is clear/i);
  assert.match(orchestrator.prompt, /do not gather repo or local-file context yourself/i);
  assert.match(orchestrator.prompt, /do not pre-read context for `builder`/i);
  assert.match(orchestrator.prompt, /if the task is clear, delegate directly to `builder`/i);
  assert.match(orchestrator.prompt, /Ignore benchmark metadata/i);
  assert.match(orchestrator.prompt, /route by the actual user task/i);
});

test('orchestrator prompt does not add delegation hops just to use more models', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;

  assert.match(orchestrator.prompt, /model mapping is an operator-configured capability boundary/i);
  assert.match(orchestrator.prompt, /route only by task intent/i);
  assert.match(orchestrator.prompt, /do not add delegation hops just to use more models/i);
});

test('orchestrator prompt requires clarification before delegation when intent is blocked', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;

  assert.match(orchestrator.prompt, /If you cannot choose exactly one specialist/i);
  assert.match(orchestrator.prompt, /ask one concise clarifying question before using the `task` tool/i);
  assert.match(orchestrator.prompt, /Do not delegate with a guessed agent/i);
  assert.match(orchestrator.prompt, /Do not invent missing objective, constraints, expected output, or verification/i);
});

test('orchestrator tool surface only permits routing and clarification', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;

  assert.equal(orchestrator.tools?.task, true);
  assert.equal(orchestrator.tools?.question, true);

  for (const tool of ['read', 'glob', 'grep', 'lsp', 'skill', 'todowrite', 'bash', 'edit', 'write']) {
    assert.equal(orchestrator.tools?.[tool], false, `${tool} should not be available to orchestrator`);
  }
});

test('specialist prompts keep explorer and librarian focused on information gathering boundaries', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const explorer = BASE_AGENT_DEFINITIONS.explorer;
  const librarian = BASE_AGENT_DEFINITIONS.librarian;

  assert.match(explorer.prompt, /known repo or local-file information/i);
  assert.match(explorer.prompt, /grep|rg/i);
  assert.match(explorer.prompt, /Do not execute approved tasks for `builder`/i);
  assert.match(librarian.prompt, /third-party or external documentation/i);
  assert.match(librarian.prompt, /unknown outside the current repo/i);
  assert.match(librarian.prompt, /Do not execute approved tasks for `builder`/i);
});

test('orchestrator prompt passes domain evidence to the executor instead of pre-reading it', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;

  assert.match(orchestrator.prompt, /Do not use `explorer` to pre-read Domain refs or Domain skills/i);
  assert.match(orchestrator.prompt, /let the target specialist read them/i);
  assert.match(orchestrator.prompt, /Do not use `explorer` to list, inspect, or summarize domain files/i);
  assert.match(orchestrator.prompt, /Do not use `explorer` to inspect workspace structure/i);
  assert.match(orchestrator.prompt, /make exactly one `builder` delegation/i);
  assert.match(orchestrator.prompt, /If you already used `explorer` during a clear execution task/i);
  assert.match(orchestrator.prompt, /Domain Catalog is authoritative/i);
  assert.match(orchestrator.prompt, /Do not ask `explorer` to check whether listed domain files exist/i);
});

test('orchestrator prompt preserves planner write boundary when delegating', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator;

  assert.match(orchestrator.prompt, /Do not add read-only constraints to `planner`/i);
  assert.match(orchestrator.prompt, /docs\/\*\*\/\*\.md/i);
});

test('leaf specialist prompts trust provider specialization without inventing teams', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');

  for (const agentName of ['builder', 'planner', 'explorer', 'librarian'] satisfies AgentName[]) {
    const prompt = BASE_AGENT_DEFINITIONS[agentName].prompt;

    assert.match(prompt, /Provider specialization/i, `${agentName} should name provider specialization`);
    assert.match(prompt, /Trust your specialist responsibility/i, `${agentName} should trust its configured role`);
    assert.match(prompt, /do not split the task into an imagined team/i, `${agentName} should avoid role-play teams`);
  }
});

test('leaf specialists cannot delegate to other subagents', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');

  assert.equal(BASE_AGENT_DEFINITIONS.builder.permission.task, 'deny');
  assert.equal(BASE_AGENT_DEFINITIONS.explorer.permission.task, 'deny');
  assert.equal(BASE_AGENT_DEFINITIONS.librarian.permission.task, 'deny');
});

test('planner is docs-only and cannot modify application code paths', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const planner = BASE_AGENT_DEFINITIONS.planner;

  assert.equal(planner.mode, 'subagent');
  assert.deepEqual(planner.permission.edit, {
    '*': 'deny',
    'docs/**/*.md': 'allow',
  });
  assert.match(planner.prompt, /docs\/\*\*\/\*\.md/i);
  assert.doesNotMatch(planner.prompt, /write markdown planning documents only by convention/i);
});

test('builder prompt carries debugging, testing, and verification workflow cues', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const builder = BASE_AGENT_DEFINITIONS.builder;

  assert.match(builder.prompt, /frontend|UI|accessibility/i);
  assert.match(builder.prompt, /failing test/i);
  assert.match(builder.prompt, /narrowest test level/i);
  assert.match(builder.prompt, /environment, data, and logic/i);
  assert.match(builder.prompt, /one build or type error at a time/i);
  assert.match(builder.prompt, /Loop evidence/i);
  assert.match(builder.prompt, /inbox/i);
});

test('planner prompt carries structure and boundary review workflow cues', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const planner = BASE_AGENT_DEFINITIONS.planner;

  assert.match(planner.prompt, /project scale and ownership/i);
  assert.match(planner.prompt, /persistence access/i);
  assert.match(planner.prompt, /DDD fit/i);
});

test('verifier is a protected read-only checker for loop completion claims', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const verifier = BASE_AGENT_DEFINITIONS.verifier;

  assert.equal(verifier.mode, 'subagent');
  assert.equal(verifier.permission.edit, 'deny');
  assert.equal(verifier.permission.task, 'deny');
  assert.match(verifier.description, /verification specialist/i);
  assert.match(verifier.prompt, /maker\/checker/i);
  assert.match(verifier.prompt, /Loop evidence/i);
  assert.match(verifier.prompt, /completion claim/i);
  assert.match(verifier.prompt, /Findings/i);
});

test('leaf specialist prompts follow the task context envelope before broader domain context', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');

  for (const agentName of ['builder', 'planner', 'explorer', 'librarian'] satisfies AgentName[]) {
    const prompt = BASE_AGENT_DEFINITIONS[agentName].prompt;

    assert.match(prompt, /Task Context Envelope/i, `${agentName} should name the envelope`);
    assert.match(prompt, /Active domains/i, `${agentName} should honor active domains`);
    assert.match(prompt, /Domain evidence/i, `${agentName} should report domain evidence`);
    assert.match(prompt, /list the exact catalog ids or paths you actually read/i, `${agentName} should report structured evidence`);
    assert.match(prompt, /Context refs/i, `${agentName} should use context refs`);
    assert.match(
      prompt,
      /If the envelope lacks correctness-critical context, ask instead of guessing/i,
      `${agentName} should stop when the envelope is insufficient`,
    );
  }
});

test('agent prompts inline workflows instead of hardcoding skill hooks', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');

  for (const [agentName, definition] of Object.entries(BASE_AGENT_DEFINITIONS)) {
    for (const hook of FORBIDDEN_PROMPT_HOOKS) {
      assert.doesNotMatch(
        definition.prompt,
        new RegExp(hook, 'i'),
        `${agentName} prompt should inline ${hook} workflow instead of naming the hook`,
      );
    }
  }
});

test('explorer is read-only and cannot delegate', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const explorer = BASE_AGENT_DEFINITIONS.explorer;

  assert.equal(explorer.mode, 'subagent');
  assert.equal(explorer.permission.edit, 'deny');
  assert.ok(!('write' in explorer.permission));
  assert.equal(explorer.permission.bash, 'deny');
  assert.equal(explorer.permission.task, 'deny');
});

test('librarian is read-only and cannot delegate', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index');
  const librarian = BASE_AGENT_DEFINITIONS.librarian;

  assert.equal(librarian.mode, 'subagent');
  assert.equal(librarian.permission.edit, 'deny');
  assert.ok(!('write' in librarian.permission));
  assert.equal(librarian.permission.task, 'deny');
  assert.equal(librarian.permission['context7_resolve-library-id'], 'allow');
  assert.equal(librarian.permission['context7_query-docs'], 'allow');
  assert.match(librarian.prompt, /Context7/i);
  assert.match(librarian.prompt, /documentation|API|reference/i);
});

test('every agent factory exposes a static mode property', async () => {
  const { AGENT_FACTORIES } = await import('../src/agents/index');

  for (const [name, factory] of Object.entries(AGENT_FACTORIES)) {
    assert.ok(
      ['primary', 'subagent', 'all'].includes(factory.mode),
      `${name} factory.mode should be a valid AgentMode`,
    );
  }
});

test('buildAgentDefinition produces valid config from factory', async () => {
  const { buildAgentDefinition } = await import('../src/agents/index');

  const orchestrator = buildAgentDefinition('orchestrator', 'openai/gpt-5.5');
  assert.equal(orchestrator.mode, 'primary');
  assert.equal(orchestrator.permission.bash, 'deny');
  assert.match(orchestrator.prompt, /Orchestrator/);

  const builder = buildAgentDefinition('builder', 'opencode-go/kimi-k2.6');
  assert.equal(builder.mode, 'subagent');
  assert.equal(builder.permission.edit, 'allow');
  assert.match(builder.prompt, /Builder/);

  const planner = buildAgentDefinition('planner', 'openai/gpt-5.5');
  assert.deepEqual(planner.permission.edit, {
    '*': 'deny',
    'docs/**/*.md': 'allow',
  });
});
