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
}: {
  configDir: string;
  domains: Record<string, true>;
}) {
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'legionaries.yaml'),
    YAML.stringify({
      system_agents: original.system_agents,
      custom_agents: original.custom_agents,
      domains,
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
  assert.match(result.stdout + result.stderr, /- Sections: 2 passed, 1 failed, 1 skipped/);
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
  assert.match(output, /- Sections: 3 passed, 0 failed, 1 skipped/);
  assert.match(output, /- Findings: 0 failures, 1 warning/);
  assert.match(output, /Runtime trace diagnostics: PASS/);
  assert.match(output, /Domain usage stats: PASS/);
  assert.match(output, /Scenario evidence: SKIPPED/);
  assert.match(output, /Your Legion doctor passed/);
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
