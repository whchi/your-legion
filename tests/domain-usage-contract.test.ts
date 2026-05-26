import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import type { DomainPack } from '../src/runtime/domain-packs';

const rootDir = path.resolve(import.meta.dirname, '..');
const tempDir = path.join(rootDir, 'temp');

function makeTempDir(t: TestContext, name: string) {
  fs.mkdirSync(tempDir, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tempDir, `${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function testDomainPacks(configDir: string): DomainPack[] {
  return [
    {
      id: 'coding',
      root: path.join(configDir, 'your-legion', 'domains', 'coding'),
      description: '# Coding',
      descriptionTruncated: false,
      components: {
        workflows: [
          {
            id: 'implementation-loop',
            path: path.join(configDir, 'your-legion', 'domains', 'coding', 'workflows', 'implementation-loop.md'),
          },
        ],
        decisions: [],
        examples: [],
        skills: [
          {
            id: 'make-code-change',
            path: path.join(configDir, 'your-legion', 'domains', 'coding', 'skills', 'make-code-change', 'SKILL.md'),
          },
        ],
      },
    },
    {
      id: 'marketing',
      root: path.join(configDir, 'your-legion', 'domains', 'marketing'),
      description: '# Marketing',
      descriptionTruncated: false,
      components: {
        workflows: [],
        decisions: [],
        examples: [],
        skills: [
          {
            id: 'campaign-brief',
            path: path.join(configDir, 'your-legion', 'domains', 'marketing', 'skills', 'campaign-brief', 'SKILL.md'),
          },
        ],
      },
    },
  ];
}

test('domain usage parser accepts a single-domain envelope', async t => {
  const { parseTaskContextEnvelope, validateDomainUsageContract } = await import(
    '../src/runtime/domain-usage-contract'
  );
  const configDir = makeTempDir(t, 'domain-contract-single');
  const envelope = parseTaskContextEnvelope(`Task Context Envelope:
- Objective: Implement focused change.
- Active domains: coding: implement and verify code
- Domain refs: coding/implementation-loop
- Domain skills: coding/make-code-change
- Context refs: src/runtime/domain-packs.ts
- Constraints: keep diff small
- Expected output: patch and verification
- Verification: bun test`);

  assert.deepEqual(envelope.activeDomains, [{ id: 'coding', responsibility: 'implement and verify code' }]);
  assert.deepEqual(envelope.domainRefs, ['coding/implementation-loop']);
  assert.deepEqual(envelope.domainSkills, ['coding/make-code-change']);

  const result = validateDomainUsageContract(envelope, testDomainPacks(configDir));

  assert.deepEqual(result.warnings, []);
});

test('domain usage validator accepts explicit mixed-domain responsibilities', async t => {
  const { parseTaskContextEnvelope, validateDomainUsageContract } = await import(
    '../src/runtime/domain-usage-contract'
  );
  const configDir = makeTempDir(t, 'domain-contract-mixed');
  const envelope = parseTaskContextEnvelope(`Task Context Envelope:
Active domains:
- coding: implement launch page
- marketing: write launch copy
Domain refs:
- coding/implementation-loop
Domain skills:
- coding/make-code-change
- marketing/campaign-brief
Verification: bun test`);

  const result = validateDomainUsageContract(envelope, testDomainPacks(configDir));

  assert.deepEqual(result.warnings, []);
});

test('domain usage validator warns for missing, vague, and unknown domain evidence', async t => {
  const { parseTaskContextEnvelope, validateDomainUsageContract } = await import(
    '../src/runtime/domain-usage-contract'
  );
  const configDir = makeTempDir(t, 'domain-contract-warnings');
  const envelope = parseTaskContextEnvelope(`Task Context Envelope:
Active domains: coding, marketing
Domain refs: marketing/missing-workflow
Domain skills: finance/runway-analysis
Verification: inspect output`);

  const result = validateDomainUsageContract(envelope, testDomainPacks(configDir));

  assert.match(result.warnings.join('\n'), /active domain must include responsibility/i);
  assert.match(result.warnings.join('\n'), /unknown domain ref: marketing\/missing-workflow/i);
  assert.match(result.warnings.join('\n'), /unknown domain skill: finance\/runway-analysis/i);
});

test('domain usage validator warns when an active domain has no discovered components', async () => {
  const { parseTaskContextEnvelope, validateDomainUsageContract } = await import(
    '../src/runtime/domain-usage-contract'
  );
  const envelope = parseTaskContextEnvelope(`Task Context Envelope:
Active domains: empty-domain: handle unsupported work
Domain refs: none
Domain skills: none
Verification: inspect output`);

  const result = validateDomainUsageContract(envelope, [
    {
      id: 'empty-domain',
      root: '/tmp/empty-domain',
      description: '# Empty Domain',
      descriptionTruncated: false,
      components: {
        workflows: [],
        decisions: [],
        examples: [],
        skills: [],
      },
    },
  ]);

  assert.match(result.warnings.join('\n'), /active domain has no discovered components: empty-domain/i);
});

test('domain usage validator accepts no-domain delegation when no domain applies', async () => {
  const { parseTaskContextEnvelope, validateDomainUsageContract } = await import(
    '../src/runtime/domain-usage-contract'
  );
  const envelope = parseTaskContextEnvelope(`Task Context Envelope:
Active domains: none
Domain refs: none
Domain skills: none
Verification: inspect answer`);

  const result = validateDomainUsageContract(envelope, []);

  assert.deepEqual(envelope.activeDomains, []);
  assert.deepEqual(envelope.domainRefs, []);
  assert.deepEqual(envelope.domainSkills, []);
  assert.deepEqual(result.warnings, []);
});

test('domain trace hooks write warn-only delegation and domain-read evidence', async t => {
  const { createDomainUsageTraceHooks, getDomainUsageTracePath, readDomainUsageTraceEvents } = await import(
    '../src/runtime/domain-usage-contract'
  );
  const configDir = makeTempDir(t, 'domain-trace-hooks');
  const worktree = path.join(configDir, 'project');
  const codingPack = testDomainPacks(configDir)[0]!;
  const hooks = createDomainUsageTraceHooks({
    configDir,
    worktree,
    domainPacks: [codingPack],
  });

  await hooks['tool.execute.before'](
    { tool: 'task', sessionID: 'ses_trace' },
    {
      args: {
        subagent_type: 'builder',
        prompt: `Task Context Envelope:
Active domains: marketing
Domain refs: none
Domain skills: coding/make-code-change
Verification: bun test`,
      },
    },
  );

  await hooks['tool.execute.after'](
    { tool: 'read', sessionID: 'ses_trace' },
    {
      args: {
        filePath: codingPack.components.skills[0]!.path,
      },
    },
  );

  assert.match(getDomainUsageTracePath({ configDir, worktree }), /your-legion\/traces\/[a-f0-9]{16}\.jsonl$/);

  const events = readDomainUsageTraceEvents({ configDir, worktree });

  assert.equal(events.length, 2);
  assert.equal(events[0].event, 'delegation');
  assert.equal(events[0].targetAgent, 'builder');
  assert.match(events[0].warnings.join('\n'), /unknown active domain: marketing/i);
  assert.equal(events[1].event, 'domain-read');
  assert.deepEqual(events[1].domainSkills, ['coding/make-code-change']);
});

test('trace CLI prints events and trace-check fails when warnings exist', async t => {
  const { appendDomainUsageTraceEvent } = await import('../src/runtime/domain-usage-contract');
  const configDir = makeTempDir(t, 'domain-trace-cli');
  const worktree = path.join(configDir, 'project');

  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      sessionID: 'ses_cli',
      event: 'delegation',
      targetAgent: 'builder',
      activeDomains: [{ id: 'coding', responsibility: 'implement code' }],
      domainRefs: [],
      domainSkills: ['coding/make-code-change'],
      warnings: ['unknown domain skill: coding/missing'],
    },
  });

  const output = execFileSync(
    'bun',
    ['src/cli.ts', 'trace', '--worktree', worktree, '--config-dir', configDir, '--limit', '1'],
    { cwd: rootDir, encoding: 'utf8' },
  );

  assert.match(output, /"event": "delegation"/);
  assert.match(output, /coding\/make-code-change/);

  const result = spawnSync('bun', ['src/cli.ts', 'trace-check', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /\[unknown-domain-skill\]/);
  assert.match(result.stderr + result.stdout, /unknown domain skill: coding\/missing/);
});

test('trace-check fails when a declared domain skill was not read', async t => {
  const { appendDomainUsageTraceEvent } = await import('../src/runtime/domain-usage-contract');
  const configDir = makeTempDir(t, 'domain-trace-missing-skill-read');
  const worktree = path.join(configDir, 'project');

  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      sessionID: 'ses_missing_read',
      delegationID: 'del_missing_read',
      event: 'delegation',
      targetAgent: 'builder',
      activeDomains: [{ id: 'coding', responsibility: 'implement code' }],
      domainRefs: [],
      domainSkills: ['coding/make-code-change'],
      warnings: [],
    },
  });

  const result = spawnSync('bun', ['src/cli.ts', 'trace-check', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /\[missing-domain-skill-read\]/);
  assert.match(result.stderr + result.stdout, /declared domain skill was not read: coding\/make-code-change/i);
});

test('trace-check fails when a declared domain ref was not read', async t => {
  const { appendDomainUsageTraceEvent } = await import('../src/runtime/domain-usage-contract');
  const configDir = makeTempDir(t, 'domain-trace-missing-ref-read');
  const worktree = path.join(configDir, 'project');

  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      sessionID: 'ses_missing_ref_read',
      delegationID: 'del_missing_ref_read',
      event: 'delegation',
      targetAgent: 'builder',
      activeDomains: [{ id: 'coding', responsibility: 'implement code' }],
      domainRefs: ['coding/implementation-loop'],
      domainSkills: [],
      warnings: [],
    },
  });

  const result = spawnSync('bun', ['src/cli.ts', 'trace-check', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /\[missing-domain-ref-read\]/);
  assert.match(result.stderr + result.stdout, /declared domain ref was not read: coding\/implementation-loop/i);
});

test('trace-check accepts a declared domain skill read under the same delegation', async t => {
  const { appendDomainUsageTraceEvent } = await import('../src/runtime/domain-usage-contract');
  const configDir = makeTempDir(t, 'domain-trace-skill-read');
  const worktree = path.join(configDir, 'project');

  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      sessionID: 'ses_read',
      delegationID: 'del_read',
      event: 'delegation',
      targetAgent: 'builder',
      activeDomains: [{ id: 'coding', responsibility: 'implement code' }],
      domainRefs: [],
      domainSkills: ['coding/make-code-change'],
      warnings: [],
    },
  });
  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:01.000Z',
      worktree,
      sessionID: 'ses_read',
      delegationID: 'del_read',
      event: 'domain-read',
      activeDomains: [],
      domainRefs: [],
      domainSkills: ['coding/make-code-change'],
      warnings: [],
    },
  });

  const result = spawnSync('bun', ['src/cli.ts', 'trace-check', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Domain usage trace check passed/);
});

test('trace-check accepts declared domain refs and skills read under the same delegation', async t => {
  const { appendDomainUsageTraceEvent } = await import('../src/runtime/domain-usage-contract');
  const configDir = makeTempDir(t, 'domain-trace-ref-and-skill-read');
  const worktree = path.join(configDir, 'project');

  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      sessionID: 'ses_ref_skill_read',
      delegationID: 'del_ref_skill_read',
      event: 'delegation',
      targetAgent: 'builder',
      activeDomains: [{ id: 'coding', responsibility: 'implement code' }],
      domainRefs: ['coding/implementation-loop'],
      domainSkills: ['coding/make-code-change'],
      warnings: [],
    },
  });
  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:01.000Z',
      worktree,
      sessionID: 'ses_ref_skill_read',
      delegationID: 'del_ref_skill_read',
      event: 'domain-read',
      activeDomains: [],
      domainRefs: ['coding/implementation-loop'],
      domainSkills: [],
      warnings: [],
    },
  });
  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:02.000Z',
      worktree,
      sessionID: 'ses_ref_skill_read',
      delegationID: 'del_ref_skill_read',
      event: 'domain-read',
      activeDomains: [],
      domainRefs: [],
      domainSkills: ['coding/make-code-change'],
      warnings: [],
    },
  });

  const result = spawnSync('bun', ['src/cli.ts', 'trace-check', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Domain usage trace check passed/);
});

test('domain scenarios define the fixed domain validation set', async () => {
  const { DOMAIN_USAGE_SCENARIOS } = await import('../src/runtime/domain-usage-contract');

  assert.deepEqual(
    DOMAIN_USAGE_SCENARIOS.map(scenario => scenario.id),
    [
      'no-domain-no-catalog',
      'no-domain-ambiguous',
      'coding-only',
      'marketing-only',
      'coding-marketing',
      'finance-only',
      'accounting-only',
      'coding-finance',
      'coding-accounting',
      'accounting-finance',
      'finance-marketing',
    ],
  );
  assert.deepEqual(DOMAIN_USAGE_SCENARIOS[0].expectedActiveDomains, []);
  assert.deepEqual(DOMAIN_USAGE_SCENARIOS[1].expectedActiveDomains, []);
  assert.deepEqual(DOMAIN_USAGE_SCENARIOS[2].expectedActiveDomains, ['coding']);
  assert.deepEqual(DOMAIN_USAGE_SCENARIOS[3].expectedActiveDomains, ['marketing']);
  assert.deepEqual(DOMAIN_USAGE_SCENARIOS[4].expectedActiveDomains, ['coding', 'marketing']);
  assert.deepEqual(DOMAIN_USAGE_SCENARIOS[5].expectedActiveDomains, ['finance']);
  assert.deepEqual(DOMAIN_USAGE_SCENARIOS[6].expectedActiveDomains, ['accounting']);
  assert.deepEqual(DOMAIN_USAGE_SCENARIOS[7].expectedActiveDomains, ['coding', 'finance']);
  assert.deepEqual(DOMAIN_USAGE_SCENARIOS[8].expectedActiveDomains, ['coding', 'accounting']);
  assert.deepEqual(DOMAIN_USAGE_SCENARIOS[9].expectedActiveDomains, ['accounting', 'finance']);
  assert.deepEqual(DOMAIN_USAGE_SCENARIOS[10].expectedActiveDomains, ['finance', 'marketing']);
});

test('domain scenario check passes only when all fixed scenarios have matching evidence', async t => {
  const { appendDomainUsageTraceEvent, DOMAIN_USAGE_SCENARIOS, evaluateDomainUsageScenarios } = await import(
    '../src/runtime/domain-usage-contract.ts'
  );
  const configDir = makeTempDir(t, 'domain-scenario-check');
  const worktree = path.join(configDir, 'project');

  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      sessionID: 'ses_scenarios',
      event: 'delegation',
      scenarioID: DOMAIN_USAGE_SCENARIOS[0].id,
      targetAgent: 'builder',
      activeDomains: [],
      domainRefs: [],
      domainSkills: [],
      warnings: [],
    },
  });

  let result = evaluateDomainUsageScenarios({
    configDir,
    worktree,
  });

  assert.equal(result.passed, false);
  assert.deepEqual(
    result.results.map(entry => entry.id),
    DOMAIN_USAGE_SCENARIOS.map(scenario => scenario.id),
  );
  assert.equal(result.results[0].passed, true);
  assert.equal(result.results[1].passed, false);

  for (const scenario of DOMAIN_USAGE_SCENARIOS.slice(1)) {
    const delegationID = `del_${scenario.id}`;
    appendDomainUsageTraceEvent({
      configDir,
      worktree,
      event: {
        version: 1,
        timestamp: '2026-05-20T00:00:00.000Z',
        worktree,
        sessionID: 'ses_scenarios',
        delegationID,
        event: 'delegation',
        scenarioID: scenario.id,
        targetAgent: 'builder',
        activeDomains: scenario.expectedActiveDomains.map(id => ({
          id,
          responsibility: `${id} responsibility`,
        })),
        domainRefs: scenario.expectedDomainRefs,
        domainSkills: scenario.expectedDomainSkills,
        warnings: [],
      },
    });
    for (const domainRef of scenario.expectedDomainRefs) {
      appendDomainUsageTraceEvent({
        configDir,
        worktree,
        event: {
          version: 1,
          timestamp: '2026-05-20T00:00:01.000Z',
          worktree,
          sessionID: 'ses_scenarios',
          delegationID,
          event: 'domain-read',
          activeDomains: [],
          domainRefs: [domainRef],
          domainSkills: [],
          warnings: [],
        },
      });
    }
    for (const domainSkill of scenario.expectedDomainSkills) {
      appendDomainUsageTraceEvent({
        configDir,
        worktree,
        event: {
          version: 1,
          timestamp: '2026-05-20T00:00:02.000Z',
          worktree,
          sessionID: 'ses_scenarios',
          delegationID,
          event: 'domain-read',
          activeDomains: [],
          domainRefs: [],
          domainSkills: [domainSkill],
          warnings: [],
        },
      });
    }
  }

  result = evaluateDomainUsageScenarios({
    configDir,
    worktree,
  });

  assert.equal(result.passed, true);
});

test('domain scenario check fails when scenario delegation lacks read evidence', async t => {
  const { appendDomainUsageTraceEvent, DOMAIN_USAGE_SCENARIOS, evaluateDomainUsageScenarios } = await import(
    '../src/runtime/domain-usage-contract.ts'
  );
  const configDir = makeTempDir(t, 'domain-scenario-read-evidence');
  const worktree = path.join(configDir, 'project');
  const scenario = DOMAIN_USAGE_SCENARIOS.find(entry => entry.id === 'coding-only')!;

  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      sessionID: 'ses_scenario_read',
      delegationID: 'del_scenario_read',
      event: 'delegation',
      scenarioID: scenario.id,
      targetAgent: 'builder',
      activeDomains: scenario.expectedActiveDomains.map(id => ({ id, responsibility: `${id} responsibility` })),
      domainRefs: scenario.expectedDomainRefs,
      domainSkills: scenario.expectedDomainSkills,
      warnings: [],
    },
  });

  const result = evaluateDomainUsageScenarios({
    configDir,
    worktree,
  });
  const scenarioResult = result.results.find(entry => entry.id === scenario.id)!;

  assert.equal(scenarioResult.passed, false);
  assert.match(scenarioResult.messages.join('\n'), /missing scenario read evidence: coding\/implementation-loop/);
  assert.match(scenarioResult.messages.join('\n'), /missing scenario read evidence: coding\/make-code-change/);
});

test('domain scenario CLI prints prompts and checks trace evidence', async t => {
  const { appendDomainUsageTraceEvent, DOMAIN_USAGE_SCENARIOS } = await import(
    '../src/runtime/domain-usage-contract.ts'
  );
  const configDir = makeTempDir(t, 'domain-scenario-cli');
  const worktree = path.join(configDir, 'project');

  const promptOutput = execFileSync('bun', ['src/cli.ts', 'domain-scenarios'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(promptOutput, /coding-only/);
  assert.match(promptOutput, /marketing-only/);
  assert.match(promptOutput, /coding-marketing/);
  assert.match(promptOutput, /finance-only/);
  assert.match(promptOutput, /accounting-only/);
  assert.match(promptOutput, /coding-finance/);
  assert.match(promptOutput, /coding-accounting/);
  assert.match(promptOutput, /accounting-finance/);
  assert.match(promptOutput, /finance-marketing/);

  let check = spawnSync(
    'bun',
    ['src/cli.ts', 'domain-scenario-check', '--worktree', worktree, '--config-dir', configDir],
    { cwd: rootDir, encoding: 'utf8' },
  );

  assert.notEqual(check.status, 0);
  assert.match(check.stderr + check.stdout, /missing scenario evidence: coding-only/);

  for (const scenario of DOMAIN_USAGE_SCENARIOS) {
    const delegationID = `del_${scenario.id}`;
    appendDomainUsageTraceEvent({
      configDir,
      worktree,
      event: {
        version: 1,
        timestamp: '2026-05-20T00:00:00.000Z',
        worktree,
        sessionID: 'ses_scenario_cli',
        delegationID,
        event: 'delegation',
        scenarioID: scenario.id,
        targetAgent: 'builder',
        activeDomains: scenario.expectedActiveDomains.map(id => ({
          id,
          responsibility: `${id} responsibility`,
        })),
        domainRefs: scenario.expectedDomainRefs,
        domainSkills: scenario.expectedDomainSkills,
        warnings: [],
      },
    });
    for (const domainRef of scenario.expectedDomainRefs) {
      appendDomainUsageTraceEvent({
        configDir,
        worktree,
        event: {
          version: 1,
          timestamp: '2026-05-20T00:00:01.000Z',
          worktree,
          sessionID: 'ses_scenario_cli',
          delegationID,
          event: 'domain-read',
          activeDomains: [],
          domainRefs: [domainRef],
          domainSkills: [],
          warnings: [],
        },
      });
    }
    for (const domainSkill of scenario.expectedDomainSkills) {
      appendDomainUsageTraceEvent({
        configDir,
        worktree,
        event: {
          version: 1,
          timestamp: '2026-05-20T00:00:02.000Z',
          worktree,
          sessionID: 'ses_scenario_cli',
          delegationID,
          event: 'domain-read',
          activeDomains: [],
          domainRefs: [],
          domainSkills: [domainSkill],
          warnings: [],
        },
      });
    }
  }

  check = spawnSync('bun', ['src/cli.ts', 'domain-scenario-check', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.equal(check.status, 0);
  assert.match(check.stdout, /Domain scenario check passed/);
});

test('built server resolves bundled coding domain from dist artifacts', async t => {
  const configDir = makeTempDir(t, 'built-server-empty-config');
  execFileSync('bun', ['run', 'build'], { cwd: rootDir, stdio: 'ignore' });

  const built = await import(pathToFileURL(path.join(rootDir, 'dist', 'server.js')).href);
  const result = await built.buildEffectiveAgentConfig({
    rootDir,
    configPath: path.join(rootDir, 'dist', 'legionaries.yaml'),
    configDir,
  });

  assert.match(result.agent.orchestrator.prompt, /coding\/make-code-change/);
  assert.match(result.agent.orchestrator.prompt, /dist\/domains\/coding/);
});
