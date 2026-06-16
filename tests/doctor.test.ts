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
  assert.match(result.stdout + result.stderr, /- Sections: 4 passed, 1 failed, 2 skipped/);
  assert.match(result.stdout + result.stderr, /Loop catalog: PASS/);
  assert.match(result.stdout + result.stderr, /- Findings: 3 failures, 3 warnings/);
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
  assert.match(output, /- Sections: 5 passed, 0 failed, 2 skipped/);
  assert.match(output, /- Findings: 0 failures, 2 warnings/);
  assert.match(output, /Runtime trace diagnostics: PASS/);
  assert.match(output, /Domain usage stats: PASS/);
  assert.match(output, /Loop catalog: PASS/);
  assert.match(output, /Loop runtime evidence: PASS/);
  assert.match(output, /Loop scenario evidence: SKIPPED/);
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

test('loop scenarios CLI prints prompts and doctor can require loop scenario evidence', t => {
  const configDir = makeTempDir(t, 'your-legion-loop-scenarios-config');
  const worktree = makeTempDir(t, 'your-legion-loop-scenarios-worktree');

  writeConfig({
    configDir,
    domains: {},
  });

  const scenarioOutput = execFileSync('bun', ['src/cli.ts', 'loop-scenarios'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  assert.match(scenarioOutput, /manual-loop-design/);
  assert.match(scenarioOutput, /Loop: daily-ci-triage/);

  const result = spawnSync('bun', ['src/cli.ts', 'doctor', '--worktree', worktree, '--config-dir', configDir, '--loop-scenarios'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stdout + result.stderr, /Loop scenario evidence: FAIL/);
  assert.match(result.stdout + result.stderr, /missing loop scenario evidence: manual-loop-design/);
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
