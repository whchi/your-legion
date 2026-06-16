import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import YAML from 'yaml';

const rootDir = path.resolve(import.meta.dirname, '..');
const tempDir = path.join(rootDir, 'temp');
const legionariesConfigPath = path.join(rootDir, 'legionaries.yaml');

function makeTempDir(t: TestContext, name: string) {
  fs.mkdirSync(tempDir, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tempDir, `${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeFile(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeConfig({
  configDir,
  domains,
  loops,
}: {
  configDir: string;
  domains: Record<string, true>;
  loops?: Record<string, unknown>;
}) {
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'legionaries.yaml'),
    YAML.stringify({
      system_agents: original.system_agents,
      custom_agents: original.custom_agents,
      domains,
      ...(loops ? { loops } : {}),
    }),
  );
}

test('doctor CLI fails static domain validation for missing declared files', t => {
  const configDir = makeTempDir(t, 'your-legion-doctor-static-fail-config');
  const worktree = makeTempDir(t, 'your-legion-doctor-static-fail-worktree');
  const domainRoot = path.join(configDir, 'your-legion', 'domains', 'product-ops');

  writeConfig({
    configDir,
    domains: {
      'product-ops': true,
    },
  });
  writeFile(
    path.join(domainRoot, 'DOMAIN.md'),
    `# Product Ops

Use this domain when the task involves product operations.

Workflows:
- \`workflows/missing-workflow.md\`

Decisions:
- \`decisions/policy.md\`

Skills:
- \`skills/review/SKILL.md\`
`,
  );
  writeFile(path.join(domainRoot, 'decisions', 'policy.md'), '# Policy\n');
  writeFile(path.join(domainRoot, 'decisions', 'undeclared.md'), '# Undeclared\n');
  writeFile(path.join(domainRoot, 'skills', 'review', 'SKILL.md'), '# Missing Frontmatter\n');

  const result = spawnSync('bun', ['src/cli.ts', 'doctor', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Your Legion doctor/);
  assert.match(result.stdout + result.stderr, /Summary:/);
  assert.match(result.stdout + result.stderr, /- Sections: 4 passed, 1 failed, 1 skipped/);
  assert.match(result.stdout + result.stderr, /Loop catalog: PASS/);
  assert.match(result.stdout + result.stderr, /- Findings: 3 failures, 2 warnings/);
  assert.match(result.stdout + result.stderr, /Static domain catalog: FAIL/);
  assert.match(result.stdout + result.stderr, /missing declared domain component: product-ops\/workflows\/missing-workflow/);
  assert.match(result.stdout + result.stderr, /domain skill missing frontmatter description: product-ops\/review/);
  assert.match(result.stdout + result.stderr, /undeclared domain component file: product-ops\/decisions\/undeclared/);
  assert.match(result.stdout + result.stderr, /Next steps:/);
  assert.match(result.stdout + result.stderr, /Inspect the enabled domain's DOMAIN\.md/);
  assert.match(result.stdout + result.stderr, /Create the missing component file or remove the declaration/);
  assert.match(result.stdout + result.stderr, /Add name and description frontmatter to the domain skill/);
  assert.match(result.stdout + result.stderr, /List the file in DOMAIN\.md or remove it/);
});

test('doctor CLI passes static and trace diagnostics for a clean installed config', t => {
  const configDir = makeTempDir(t, 'your-legion-doctor-pass-config');
  const worktree = makeTempDir(t, 'your-legion-doctor-pass-worktree');
  const domainRoot = path.join(configDir, 'your-legion', 'domains', 'product-ops');

  writeConfig({
    configDir,
    domains: {
      'product-ops': true,
    },
  });
  writeFile(
    path.join(domainRoot, 'DOMAIN.md'),
    `# Product Ops

Use this domain when the task involves product operations.

Decisions:
- \`decisions/policy.md\`

Skills:
- \`skills/review/SKILL.md\`
`,
  );
  writeFile(path.join(domainRoot, 'decisions', 'policy.md'), '# Policy\n');
  writeFile(
    path.join(domainRoot, 'skills', 'review', 'SKILL.md'),
    `---
name: review
description: Review product operations constraints.
---

# Review
`,
  );

  const output = execFileSync('bun', ['src/cli.ts', 'doctor', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(output, /Your Legion doctor/);
  assert.match(output, /Static domain catalog: PASS/);
  assert.match(output, /Summary:/);
  assert.match(output, /- Sections: 5 passed, 0 failed, 1 skipped/);
  assert.match(output, /- Findings: 0 failures, 1 warning/);
  assert.match(output, /Runtime trace diagnostics: PASS/);
  assert.match(output, /Domain usage stats: PASS/);
  assert.match(output, /Loop catalog: PASS/);
  assert.match(output, /Loop runtime evidence: PASS/);
  assert.match(output, /Scenario evidence: SKIPPED/);
  assert.match(output, /Your Legion doctor passed/);
});

test('doctor CLI fails loop catalog validation for missing inbox and unsafe checker split', t => {
  const configDir = makeTempDir(t, 'your-legion-doctor-loop-fail-config');
  const worktree = makeTempDir(t, 'your-legion-doctor-loop-fail-worktree');

  writeConfig({
    configDir,
    domains: {},
    loops: {
      'daily-ci-triage': {
        description: 'Daily CI triage',
        objective: 'Find and fix CI failures',
        trigger: { type: 'scheduled', cadence: 'daily' },
        inbox_path: 'docs/legion-loops/daily-ci-triage.md',
        agents: {
          maker: 'builder',
          verifier: 'builder',
        },
        verification: {
          commands: ['bun test'],
          completion: 'Tests pass',
        },
      },
    },
  });

  const result = spawnSync('bun', ['src/cli.ts', 'doctor', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Loop catalog: FAIL/);
  assert.match(result.stdout + result.stderr, /missing loop inbox: daily-ci-triage -> docs\/legion-loops\/daily-ci-triage\.md/);
  assert.match(result.stdout + result.stderr, /loop maker and verifier must be separate: daily-ci-triage/);
});

test('doctor CLI fails loop runtime evidence when maker has no verifier delegation', async t => {
  const configDir = makeTempDir(t, 'your-legion-doctor-loop-runtime-config');
  const worktree = makeTempDir(t, 'your-legion-doctor-loop-runtime-worktree');
  const { appendDomainUsageTraceEvent } = await import('../src/runtime/domain-usage-contract');

  writeConfig({
    configDir,
    domains: {},
    loops: {
      'daily-ci-triage': {
        description: 'Daily CI triage',
        objective: 'Find and fix CI failures',
        trigger: { type: 'manual' },
        inbox_path: 'docs/legion-loops/daily-ci-triage.md',
        agents: {
          maker: 'builder',
          verifier: 'verifier',
        },
        verification: {
          commands: ['bun test'],
          completion: 'Tests pass',
        },
      },
    },
  });
  writeFile(path.join(worktree, 'docs', 'legion-loops', 'daily-ci-triage.md'), '# Daily CI triage\n');
  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      sessionID: 'ses_loop_runtime',
      delegationID: 'del_loop_runtime',
      loopID: 'daily-ci-triage',
      event: 'delegation',
      targetAgent: 'builder',
      activeDomains: [],
      domainRefs: [],
      domainSkills: [],
      warnings: [],
    },
  });

  const result = spawnSync('bun', ['src/cli.ts', 'doctor', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Loop runtime evidence: FAIL/);
  assert.match(result.stdout + result.stderr, /loop maker delegation has no verifier evidence: daily-ci-triage/);
});

test('doctor CLI fails loop runtime evidence when a maker-complete run lacks verifier completion', async t => {
  const configDir = makeTempDir(t, 'your-legion-doctor-loop-run-runtime-config');
  const worktree = makeTempDir(t, 'your-legion-doctor-loop-run-runtime-worktree');
  const { appendDomainUsageTraceEvent } = await import('../src/runtime/domain-usage-contract');

  writeConfig({
    configDir,
    domains: {},
    loops: {
      'daily-ci-triage': {
        description: 'Daily CI triage',
        objective: 'Find and fix CI failures',
        trigger: { type: 'manual' },
        inbox_path: 'docs/legion-loops/daily-ci-triage.md',
        agents: {
          maker: 'builder',
          verifier: 'verifier',
        },
        verification: {
          commands: ['bun test'],
          completion: 'Tests pass',
        },
      },
    },
  });
  writeFile(path.join(worktree, 'docs', 'legion-loops', 'daily-ci-triage.md'), '# Daily CI triage\n');
  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      sessionID: 'ses_loop_run_runtime',
      delegationID: 'del_loop_run_runtime',
      loopID: 'daily-ci-triage',
      loopRunID: 'run_2026_05_20',
      loopStatus: 'maker-complete',
      completionClaim: 'Fixed the actionable CI failure.',
      verificationCommands: ['bun test'],
      verificationOutcome: 'passed',
      event: 'delegation',
      targetAgent: 'builder',
      activeDomains: [],
      domainRefs: [],
      domainSkills: [],
      warnings: [],
    },
  });

  const result = spawnSync('bun', ['src/cli.ts', 'doctor', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Loop runtime evidence: FAIL/);
  assert.match(
    result.stdout + result.stderr,
    /loop run maker-complete has no verifier-complete: daily-ci-triage\/run_2026_05_20/,
  );
});

test('loop-runs CLI prints grouped loop completion ledger evidence', async t => {
  const configDir = makeTempDir(t, 'your-legion-loop-runs-cli-config');
  const worktree = makeTempDir(t, 'your-legion-loop-runs-cli-worktree');
  const { appendDomainUsageTraceEvent } = await import('../src/runtime/domain-usage-contract');

  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      sessionID: 'ses_loop_runs_cli',
      delegationID: 'del_loop_runs_maker',
      loopID: 'daily-ci-triage',
      loopRunID: 'run_2026_05_20',
      loopStatus: 'maker-complete',
      completionClaim: 'Fixed the actionable CI failure.',
      verificationCommands: ['bun test'],
      verificationOutcome: 'passed',
      event: 'delegation',
      targetAgent: 'builder',
      activeDomains: [],
      domainRefs: [],
      domainSkills: [],
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
      sessionID: 'ses_loop_runs_cli',
      delegationID: 'del_loop_runs_verifier',
      loopID: 'daily-ci-triage',
      loopRunID: 'run_2026_05_20',
      loopStatus: 'verifier-complete',
      completionClaim: 'No findings after checking diff and tests.',
      verificationCommands: ['git diff --check'],
      verificationOutcome: 'passed',
      event: 'delegation',
      targetAgent: 'verifier',
      activeDomains: [],
      domainRefs: [],
      domainSkills: [],
      warnings: [],
    },
  });

  const output = execFileSync('bun', ['src/cli.ts', 'loop-runs', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(output, /Loop run run_2026_05_20/);
  assert.match(output, /Loop: daily-ci-triage/);
  assert.match(output, /Statuses: maker-complete, verifier-complete/);
  assert.match(output, /Targets: builder, verifier/);
  assert.match(output, /Verification outcome: passed/);
  assert.match(output, /Verification commands: bun test, git diff --check/);
  assert.match(output, /Completion claim: No findings after checking diff and tests\./);
});

test('loop CLI can create and list a configured loop contract', t => {
  const configDir = makeTempDir(t, 'your-legion-loop-cli-config');
  const worktree = makeTempDir(t, 'your-legion-loop-cli-worktree');

  writeConfig({
    configDir,
    domains: {},
  });

  const createOutput = execFileSync(
    'bun',
    [
      'src/cli.ts',
      'create-loop',
      'daily-ci-triage',
      '--worktree',
      worktree,
      '--config-dir',
      configDir,
      '--description',
      'Daily CI triage',
      '--objective',
      'Find and verify CI fixes',
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
    },
  );

  assert.match(createOutput, /Created loop daily-ci-triage/);
  assert.ok(fs.existsSync(path.join(worktree, 'docs', 'legion-loops', 'daily-ci-triage.md')));

  const listOutput = execFileSync('bun', ['src/cli.ts', 'loops', '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(listOutput, /daily-ci-triage/);
  assert.match(listOutput, /Daily CI triage/);
  assert.match(listOutput, /docs\/legion-loops\/daily-ci-triage\.md/);
});

test('create-loop rejects non kebab-case loop ids before writing an inbox', t => {
  const configDir = makeTempDir(t, 'your-legion-loop-invalid-id-config');
  const worktree = makeTempDir(t, 'your-legion-loop-invalid-id-worktree');

  writeConfig({
    configDir,
    domains: {},
  });

  const result = spawnSync(
    'bun',
    ['src/cli.ts', 'create-loop', '../bad-loop', '--worktree', worktree, '--config-dir', configDir],
    {
      cwd: rootDir,
      encoding: 'utf8',
    },
  );
  const parsed = YAML.parse(fs.readFileSync(path.join(configDir, 'legionaries.yaml'), 'utf8'));

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid loop id: \.\.\/bad-loop/);
  assert.equal(parsed.loops, undefined);
  assert.equal(fs.existsSync(path.join(worktree, 'docs', 'bad-loop.md')), false);
});

test('create-loop preset creates a friendly configured loop contract', t => {
  const configDir = makeTempDir(t, 'your-legion-loop-preset-config');
  const worktree = makeTempDir(t, 'your-legion-loop-preset-worktree');

  writeConfig({
    configDir,
    domains: {
      coding: true,
    },
  });

  const createOutput = execFileSync(
    'bun',
    [
      'src/cli.ts',
      'create-loop',
      'daily-ci-triage',
      '--preset',
      'ci-triage',
      '--worktree',
      worktree,
      '--config-dir',
      configDir,
      '--verification',
      'bun test,bun run build',
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
    },
  );
  const parsed = YAML.parse(fs.readFileSync(path.join(configDir, 'legionaries.yaml'), 'utf8'));
  const loop = parsed.loops['daily-ci-triage'];
  const inbox = fs.readFileSync(path.join(worktree, 'docs', 'legion-loops', 'daily-ci-triage.md'), 'utf8');

  assert.match(createOutput, /Preset: ci-triage/);
  assert.equal(loop.description, 'Daily CI triage');
  assert.equal(loop.trigger.type, 'scheduled');
  assert.equal(loop.trigger.cadence, 'daily');
  assert.deepEqual(loop.active_domains, [
    {
      id: 'coding',
      responsibility: 'triage CI failures and implement verified fixes',
    },
  ]);
  assert.deepEqual(loop.domain_refs, ['coding/implementation-loop']);
  assert.deepEqual(loop.domain_skills, ['coding/make-code-change']);
  assert.deepEqual(loop.verification.commands, ['bun test', 'bun run build']);
  assert.match(inbox, /## How To Start/);
  assert.match(inbox, /bunx @whchi\/your-legion loop-prompt daily-ci-triage --worktree \./);
});

test('loop-presets CLI lists quick-start loop templates', () => {
  const output = execFileSync('bun', ['src/cli.ts', 'loop-presets'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(output, /basic/);
  assert.match(output, /ci-triage/);
  assert.match(output, /issue-triage/);
  assert.match(output, /docs-refresh/);
  assert.match(output, /release-check/);
});

test('loop-prompt CLI prints a ready task context envelope for a configured loop', t => {
  const configDir = makeTempDir(t, 'your-legion-loop-prompt-config');
  const worktree = makeTempDir(t, 'your-legion-loop-prompt-worktree');

  writeConfig({
    configDir,
    domains: {
      coding: true,
    },
    loops: {
      'daily-ci-triage': {
        description: 'Daily CI triage',
        objective: 'Find actionable CI failures and produce verified fixes',
        trigger: { type: 'scheduled', cadence: 'daily' },
        inbox_path: 'docs/legion-loops/daily-ci-triage.md',
        active_domains: [{ id: 'coding', responsibility: 'triage CI failures' }],
        domain_refs: ['coding/implementation-loop'],
        domain_skills: ['coding/make-code-change'],
        agents: {
          triage: 'planner',
          maker: 'builder',
          verifier: 'verifier',
        },
        worktree: {
          isolation: 'required',
        },
        verification: {
          commands: ['bun test', 'bun run build'],
          completion: 'All commands pass.',
        },
        connectors: {
          mode: 'manual',
          targets: [],
        },
      },
    },
  });
  writeFile(path.join(worktree, 'docs', 'legion-loops', 'daily-ci-triage.md'), '# Daily CI triage\n');

  const output = execFileSync(
    'bun',
    [
      'src/cli.ts',
      'loop-prompt',
      'daily-ci-triage',
      '--worktree',
      worktree,
      '--config-dir',
      configDir,
      '--run-id',
      'run_manual_001',
    ],
    {
      cwd: rootDir,
      encoding: 'utf8',
    },
  );

  assert.match(output, /Task Context Envelope:/);
  assert.match(output, /Loop: daily-ci-triage/);
  assert.match(output, /Loop run: run_manual_001/);
  assert.match(output, /Loop status: started/);
  assert.match(output, /Objective: Find actionable CI failures and produce verified fixes/);
  assert.match(output, /Active domains: coding: triage CI failures/);
  assert.match(output, /Domain refs: coding\/implementation-loop/);
  assert.match(output, /Domain skills: coding\/make-code-change/);
  assert.match(output, /Context refs: docs\/legion-loops\/daily-ci-triage\.md/);
  assert.match(output, /Verification: bun test, bun run build/);
  assert.match(output, /Completion claim: none/);
  assert.match(output, /Verification outcome: none/);
});

test('doctor CLI includes scenario evidence only when requested', t => {
  const configDir = makeTempDir(t, 'your-legion-doctor-scenarios-config');
  const worktree = makeTempDir(t, 'your-legion-doctor-scenarios-worktree');

  writeConfig({
    configDir,
    domains: {},
  });

  const result = spawnSync('bun', ['src/cli.ts', 'doctor', '--worktree', worktree, '--config-dir', configDir, '--scenarios'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Static domain catalog: PASS/);
  assert.match(result.stdout + result.stderr, /Runtime trace diagnostics: PASS/);
  assert.match(result.stdout + result.stderr, /Domain usage stats: PASS/);
  assert.match(result.stdout + result.stderr, /Scenario evidence: FAIL/);
  assert.match(result.stdout + result.stderr, /missing scenario evidence: coding-only/);
  assert.match(result.stdout + result.stderr, /Run the matching OpenCode prompt, then rerun doctor with the same --worktree value/);
});

test('doctor CLI explains unknown runtime domain evidence', async t => {
  const configDir = makeTempDir(t, 'your-legion-doctor-runtime-warning-config');
  const worktree = makeTempDir(t, 'your-legion-doctor-runtime-warning-worktree');
  const { appendDomainUsageTraceEvent } = await import('../src/runtime/domain-usage-contract');

  writeConfig({
    configDir,
    domains: {},
  });
  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      event: 'delegation',
      targetAgent: 'builder',
      activeDomains: [],
      domainRefs: [],
      domainSkills: ['coding/missing'],
      warnings: ['unknown domain skill: coding/missing'],
    },
  });

  const result = spawnSync('bun', ['src/cli.ts', 'doctor', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /\[unknown-domain-skill\]/);
  assert.match(result.stdout + result.stderr, /Use only enabled domain ids and catalog ids shown in the Domain Catalog/);
});

test('doctor CLI reports domain usage stats from trace evidence', async t => {
  const configDir = makeTempDir(t, 'your-legion-doctor-usage-stats-config');
  const worktree = makeTempDir(t, 'your-legion-doctor-usage-stats-worktree');
  const domainRoot = path.join(configDir, 'your-legion', 'domains', 'product-ops');
  const { appendDomainUsageTraceEvent } = await import('../src/runtime/domain-usage-contract');

  writeConfig({
    configDir,
    domains: {
      'product-ops': true,
    },
  });
  writeFile(
    path.join(domainRoot, 'DOMAIN.md'),
    `# Product Ops

Use this domain when the task involves product operations.

Decisions:
- \`decisions/policy.md\`

Skills:
- \`skills/review/SKILL.md\`
`,
  );
  writeFile(path.join(domainRoot, 'decisions', 'policy.md'), '# Policy\n');
  writeFile(
    path.join(domainRoot, 'skills', 'review', 'SKILL.md'),
    `---
name: review
description: Review product operations constraints.
---

# Review
`,
  );

  appendDomainUsageTraceEvent({
    configDir,
    worktree,
    event: {
      version: 1,
      timestamp: '2026-05-20T00:00:00.000Z',
      worktree,
      sessionID: 'ses_stats',
      delegationID: 'del_stats',
      event: 'delegation',
      targetAgent: 'builder',
      activeDomains: [{ id: 'product-ops', responsibility: 'review product policy' }],
      domainRefs: ['product-ops/policy'],
      domainSkills: ['product-ops/review'],
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
      sessionID: 'ses_stats',
      delegationID: 'del_no_domain',
      event: 'delegation',
      targetAgent: 'builder',
      activeDomains: [],
      domainRefs: [],
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
      sessionID: 'ses_stats',
      delegationID: 'del_stats',
      event: 'domain-read',
      activeDomains: [],
      domainRefs: ['product-ops/policy'],
      domainSkills: ['product-ops/review'],
      warnings: [],
    },
  });

  const output = execFileSync('bun', ['src/cli.ts', 'doctor', '--worktree', worktree, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(output, /Domain usage stats:/);
  assert.match(output, /Trace events: 3 \(2 delegations, 1 domain reads\)/);
  assert.match(output, /No-domain delegations: 1/);
  assert.match(output, /Active domains: product-ops=1/);
  assert.match(output, /Domain refs declared\/read: product-ops\/policy=declared:1\/read:1/);
  assert.match(output, /Domain skills declared\/read: product-ops\/review=declared:1\/read:1/);
  assert.match(output, /Delegation del_stats: target=builder; active=product-ops: review product policy/);
  assert.match(output, /declared refs=product-ops\/policy; read refs=product-ops\/policy/);
  assert.match(output, /declared skills=product-ops\/review; read skills=product-ops\/review/);
  assert.match(output, /Delegation del_no_domain: target=builder; active=none/);
  assert.match(output, /Latest domain read: 2026-05-20T00:00:02.000Z/);
  assert.match(output, /Unused catalog refs: none/);
  assert.match(output, /Unused catalog skills: none/);
});

test('check CLI alias is not supported', () => {
  const result = spawnSync('bun', ['src/cli.ts', 'check'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, /use `doctor`/);
  assert.match(result.stdout, /Usage:/);
});
