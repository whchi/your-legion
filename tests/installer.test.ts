import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const tempDir = path.join(rootDir, 'temp');

function makeTempDir(t: TestContext, name: string) {
  fs.mkdirSync(tempDir, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tempDir, `${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('installer writes global legionaries.yaml and registers the plugin', async t => {
  const configDir = makeTempDir(t, 'your-legion-install');
  const sourceConfigPath = path.join(rootDir, 'legionaries.yaml');
  const { installYourLegion } = await import('../src/install');

  const result = installYourLegion({
    configDir,
    sourceConfigPath,
    now: new Date('2026-01-25T11:18:28.014Z'),
  });

  const agentConfigPath = path.join(configDir, 'legionaries.yaml');
  const opencodeConfigPath = path.join(configDir, 'opencode.json');
  const opencodeConfig = JSON.parse(fs.readFileSync(opencodeConfigPath, 'utf8'));

  assert.equal(result.legionariesConfigPath, agentConfigPath);
  assert.equal(result.legionariesBackupPath, undefined);
  assert.equal(fs.readFileSync(agentConfigPath, 'utf8'), fs.readFileSync(sourceConfigPath, 'utf8'));
  assert.deepEqual(opencodeConfig.plugin, ['@whchi/your-legion']);
  assert.equal(fs.existsSync(path.join(configDir, 'your-legion', 'domains')), true);
  assert.equal(fs.existsSync(path.join(configDir, 'your-legion', 'shared', 'skills')), false);
});

test('installer defaults enabled domains to coding', async t => {
  const configDir = makeTempDir(t, 'your-legion-install-default-domains');
  const sourceConfigPath = path.join(rootDir, 'legionaries.yaml');
  const { installYourLegion } = await import('../src/install');

  installYourLegion({
    configDir,
    sourceConfigPath,
    now: new Date('2026-01-25T11:18:28.014Z'),
  });

  const config = YAML.parse(fs.readFileSync(path.join(configDir, 'legionaries.yaml'), 'utf8'));

  assert.deepEqual(config.domains, { coding: true });
});

test('installer writes selected pickable domains into legionaries.yaml', async t => {
  const configDir = makeTempDir(t, 'your-legion-install-selected-domains');
  const sourceConfigPath = path.join(rootDir, 'legionaries.yaml');
  const { installYourLegion } = await import('../src/install');

  const result = installYourLegion({
    configDir,
    sourceConfigPath,
    enabledDomains: ['coding', 'marketing', 'finance', 'accounting'],
    now: new Date('2026-01-25T11:18:28.014Z'),
  });

  const config = YAML.parse(fs.readFileSync(path.join(configDir, 'legionaries.yaml'), 'utf8'));

  assert.deepEqual(config.domains, {
    coding: true,
    marketing: true,
    finance: true,
    accounting: true,
  });
  assert.deepEqual(result.enabledDomains, ['coding', 'marketing', 'finance', 'accounting']);
});

test('installer accepts existing custom global domains in --domains', async t => {
  const configDir = makeTempDir(t, 'your-legion-install-custom-domain');
  const sourceConfigPath = path.join(rootDir, 'legionaries.yaml');
  const { createDomainPack, installYourLegion } = await import('../src/install');

  createDomainPack({
    configDir,
    domainID: 'product-ops',
    components: ['decisions'],
  });

  const result = installYourLegion({
    configDir,
    sourceConfigPath,
    enabledDomains: ['coding', 'product-ops'],
    now: new Date('2026-01-25T11:18:28.014Z'),
  });

  const config = YAML.parse(fs.readFileSync(path.join(configDir, 'legionaries.yaml'), 'utf8'));

  assert.deepEqual(config.domains, {
    coding: true,
    'product-ops': true,
  });
  assert.deepEqual(result.enabledDomains, ['coding', 'product-ops']);
});

test('installer preserves an existing global legionaries.yaml on reinstall', async t => {
  const configDir = makeTempDir(t, 'your-legion-install-preserve');
  const sourceConfigPath = path.join(rootDir, 'legionaries.yaml');
  const existingConfigPath = path.join(configDir, 'legionaries.yaml');
  fs.writeFileSync(existingConfigPath, 'domains:\n  coding: true\n  product-ops: true\n');
  const { installYourLegion } = await import('../src/install');

  const result = installYourLegion({
    configDir,
    sourceConfigPath,
    now: new Date('2026-01-25T11:18:28.014Z'),
  });

  assert.equal(result.configAction, 'preserved');
  assert.equal(result.legionariesBackupPath, undefined);
  assert.equal(fs.readFileSync(existingConfigPath, 'utf8'), 'domains:\n  coding: true\n  product-ops: true\n');
  assert.deepEqual(result.enabledDomains, ['coding', 'product-ops']);
});

test('installer replaces enabled domains when --domains is provided', async t => {
  const configDir = makeTempDir(t, 'your-legion-install-replace-domains');
  const sourceConfigPath = path.join(rootDir, 'legionaries.yaml');
  const existingConfigPath = path.join(configDir, 'legionaries.yaml');
  fs.writeFileSync(existingConfigPath, 'domains:\n  coding: true\n  product-ops: true\n');
  const { installYourLegion } = await import('../src/install');

  const result = installYourLegion({
    configDir,
    sourceConfigPath,
    enabledDomains: ['coding', 'marketing'],
    now: new Date('2026-01-25T11:18:28.014Z'),
  });
  const config = YAML.parse(fs.readFileSync(existingConfigPath, 'utf8'));
  const backupPath = path.join(configDir, 'legionaries.yaml.bak.2026-01-25T11-18-28-014Z');

  assert.equal(result.configAction, 'replaced');
  assert.equal(result.legionariesBackupPath, backupPath);
  assert.equal(fs.readFileSync(backupPath, 'utf8'), 'domains:\n  coding: true\n  product-ops: true\n');
  assert.deepEqual(config.domains, {
    coding: true,
    marketing: true,
  });
});

test('installer merges enabled domains when --add-domains is provided', async t => {
  const configDir = makeTempDir(t, 'your-legion-install-add-domains');
  const sourceConfigPath = path.join(rootDir, 'legionaries.yaml');
  const existingConfigPath = path.join(configDir, 'legionaries.yaml');
  fs.writeFileSync(existingConfigPath, 'domains:\n  coding: true\n  product-ops: true\n');
  const { installYourLegion } = await import('../src/install');

  const result = installYourLegion({
    configDir,
    sourceConfigPath,
    addDomains: ['marketing', 'finance'],
    now: new Date('2026-01-25T11:18:28.014Z'),
  });
  const config = YAML.parse(fs.readFileSync(existingConfigPath, 'utf8'));

  assert.equal(result.configAction, 'updated');
  assert.match(result.legionariesBackupPath ?? '', /legionaries\.yaml\.bak\.2026-01-25T11-18-28-014Z$/);
  assert.deepEqual(config.domains, {
    coding: true,
    'product-ops': true,
    marketing: true,
    finance: true,
  });
});

test('installer rejects using replace and add domain modes together', async t => {
  const configDir = makeTempDir(t, 'your-legion-install-domain-mode-conflict');
  const sourceConfigPath = path.join(rootDir, 'legionaries.yaml');
  const { installYourLegion } = await import('../src/install');

  assert.throws(
    () =>
      installYourLegion({
        configDir,
        sourceConfigPath,
        enabledDomains: ['coding'],
        addDomains: ['marketing'],
      }),
    /use either --domains or --add-domains/i,
  );
});

test('installer preserves existing plugin entries while registering Your Legion once', async t => {
  const configDir = makeTempDir(t, 'your-legion-install-plugin');
  fs.writeFileSync(
    path.join(configDir, 'opencode.json'),
    JSON.stringify({ plugin: ['opencode-wakatime', '@whchi/your-legion'] }, null, 2),
  );
  const { installYourLegion } = await import('../src/install');

  installYourLegion({
    configDir,
    sourceConfigPath: path.join(rootDir, 'legionaries.yaml'),
    now: new Date('2026-01-25T11:18:28.014Z'),
  });

  const opencodeConfig = JSON.parse(fs.readFileSync(path.join(configDir, 'opencode.json'), 'utf8'));

  assert.deepEqual(opencodeConfig.plugin, ['opencode-wakatime', '@whchi/your-legion']);
});

test('installer writes opencode.json without modifying existing opencode.jsonc', async t => {
  const configDir = makeTempDir(t, 'your-legion-install-jsonc');
  fs.writeFileSync(path.join(configDir, 'opencode.jsonc'), '{\n  // existing plugin config\n  "plugin": ["opencode-wakatime",],\n}\n');
  const { installYourLegion } = await import('../src/install');

  const result = installYourLegion({
    configDir,
    sourceConfigPath: path.join(rootDir, 'legionaries.yaml'),
    now: new Date('2026-01-25T11:18:28.014Z'),
  });

  const opencodeJsonc = fs.readFileSync(path.join(configDir, 'opencode.jsonc'), 'utf8');
  const opencodeConfig = JSON.parse(fs.readFileSync(path.join(configDir, 'opencode.json'), 'utf8'));

  assert.equal(result.opencodeConfigPath, path.join(configDir, 'opencode.json'));
  assert.match(opencodeJsonc, /existing plugin config/);
  assert.deepEqual(opencodeConfig.plugin, ['@whchi/your-legion']);
});

test('createDomainPack scaffolds a domain manifest without forcing component folders', async t => {
  const configDir = makeTempDir(t, 'your-legion-domain');
  const { createDomainPack } = await import('../src/install');

  const result = createDomainPack({
    configDir,
    domainID: 'marketing-ops',
  });

  assert.equal(result.domainID, 'marketing-ops');
  assert.equal(result.domainRootPath, path.join(configDir, 'your-legion', 'domains', 'marketing-ops'));
  assert.deepEqual(result.componentPaths, []);
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'README.md')), false);
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'DOMAIN.md')), true);
  assert.equal(result.descriptionPath, path.join(result.domainRootPath, 'DOMAIN.md'));
  assert.match(fs.readFileSync(path.join(result.domainRootPath, 'DOMAIN.md'), 'utf8'), /Use this domain when/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(result.domainRootPath, 'DOMAIN.md'), 'utf8'),
    /example-(workflow|decision|output|skill)/,
  );
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'workflows')), false);
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'decisions')), false);
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'examples')), false);
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'skills')), false);
  assert.equal(fs.existsSync(path.join(configDir, 'your-legion', 'shared', 'skills')), false);
  assert.match(result.enablementSnippet, /marketing-ops: true/);
});

test('createDomainPack scaffolds only selected optional component folders', async t => {
  const configDir = makeTempDir(t, 'your-legion-domain-components');
  const { createDomainPack } = await import('../src/install');

  const result = createDomainPack({
    configDir,
    domainID: 'marketing-ops',
    components: ['decisions', 'skills'],
  });

  assert.deepEqual(
    result.componentPaths.map(componentPath => path.relative(result.domainRootPath, componentPath)),
    ['decisions', 'skills'],
  );
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'workflows')), false);
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'decisions')), true);
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'examples')), false);
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'skills')), true);
  const domainDescription = fs.readFileSync(path.join(result.domainRootPath, 'DOMAIN.md'), 'utf8');
  assert.doesNotMatch(domainDescription, /Workflows:/);
  assert.doesNotMatch(domainDescription, /Examples:/);
  assert.match(domainDescription, /Decisions:\n- `decisions\/example-decision\.md`/);
  assert.match(domainDescription, /Skills:\n- `skills\/example-skill\/SKILL\.md`/);
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'decisions', 'example-decision.md')), true);
  assert.equal(fs.existsSync(path.join(result.domainRootPath, 'skills', 'example-skill', 'SKILL.md')), true);
  assert.match(
    fs.readFileSync(path.join(result.domainRootPath, 'skills', 'example-skill', 'SKILL.md'), 'utf8'),
    /description:/,
  );
});

test('createDomainPack rejects non kebab-case domain ids', async t => {
  const configDir = makeTempDir(t, 'your-legion-domain-invalid');
  const { createDomainPack } = await import('../src/install');

  assert.throws(() => createDomainPack({ configDir, domainID: 'Marketing Ops' }), /invalid domain id: Marketing Ops/);
});

test('createDomainPack rejects duplicate global domain ids', async t => {
  const configDir = makeTempDir(t, 'your-legion-domain-duplicate');
  const { createDomainPack } = await import('../src/install');

  createDomainPack({ configDir, domainID: 'product-ops' });

  assert.throws(() => createDomainPack({ configDir, domainID: 'product-ops' }), /domain already exists: product-ops/);
});

test('createDomainPack rejects bundled domain ids', async t => {
  const configDir = makeTempDir(t, 'your-legion-domain-bundled-duplicate');
  const { createDomainPack } = await import('../src/install');

  assert.throws(() => createDomainPack({ configDir, domainID: 'coding' }), /domain already exists: coding/);
});

test('createDomainPack can enable a new domain in an installed legionaries config', async t => {
  const configDir = makeTempDir(t, 'your-legion-domain-enable');
  const sourceConfigPath = path.join(rootDir, 'legionaries.yaml');
  const { createDomainPack, installYourLegion } = await import('../src/install');

  installYourLegion({
    configDir,
    sourceConfigPath,
    enabledDomains: ['coding'],
    now: new Date('2026-01-25T11:18:28.014Z'),
  });

  const result = createDomainPack({
    configDir,
    domainID: 'product-ops',
    components: ['workflows', 'skills'],
    enable: true,
  });
  const config = YAML.parse(fs.readFileSync(path.join(configDir, 'legionaries.yaml'), 'utf8'));

  assert.equal(result.enabled, true);
  assert.deepEqual(config.domains, {
    coding: true,
    'product-ops': true,
  });
});

test('createDomainPack enable requires an installed legionaries config', async t => {
  const configDir = makeTempDir(t, 'your-legion-domain-enable-missing-config');
  const { createDomainPack } = await import('../src/install');

  assert.throws(
    () => createDomainPack({ configDir, domainID: 'product-ops', enable: true }),
    /cannot enable domain before install/i,
  );
  assert.equal(fs.existsSync(path.join(configDir, 'your-legion', 'domains', 'product-ops')), false);
});

test('create-domain cli scaffolds a domain under an explicit config dir', t => {
  const configDir = makeTempDir(t, 'your-legion-domain-cli');

  const output = execFileSync('bun', ['src/cli.ts', 'create-domain', 'marketing-ops', '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(output, /Created domain marketing-ops/);
  assert.equal(fs.existsSync(path.join(configDir, 'your-legion', 'domains', 'marketing-ops', 'DOMAIN.md')), true);
  assert.equal(fs.existsSync(path.join(configDir, 'your-legion', 'domains', 'marketing-ops', 'README.md')), false);
});

test('create-domain cli accepts selected optional component folders', t => {
  const configDir = makeTempDir(t, 'your-legion-domain-cli-components');

  const output = execFileSync(
    'bun',
    ['src/cli.ts', 'create-domain', 'marketing-ops', '--config-dir', configDir, '--components', 'decisions,skills'],
    { cwd: rootDir, encoding: 'utf8' },
  );
  const domainRoot = path.join(configDir, 'your-legion', 'domains', 'marketing-ops');

  assert.match(output, /Components: decisions, skills/);
  assert.equal(fs.existsSync(path.join(domainRoot, 'decisions')), true);
  assert.equal(fs.existsSync(path.join(domainRoot, 'skills')), true);
  assert.equal(fs.existsSync(path.join(domainRoot, 'workflows')), false);
  assert.equal(fs.existsSync(path.join(domainRoot, 'examples')), false);
});

test('create-domain cli rejects an existing domain', t => {
  const configDir = makeTempDir(t, 'your-legion-domain-cli-duplicate');
  execFileSync('bun', ['src/cli.ts', 'create-domain', 'product-ops', '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  const result = spawnSync('bun', ['src/cli.ts', 'create-domain', 'product-ops', '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /domain already exists: product-ops/);
});

test('create-domain cli can enable the domain in legionaries.yaml', t => {
  const configDir = makeTempDir(t, 'your-legion-domain-cli-enable');
  execFileSync('bun', ['src/cli.ts', 'install', '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  const output = execFileSync(
    'bun',
    [
      'src/cli.ts',
      'create-domain',
      'product-ops',
      '--config-dir',
      configDir,
      '--components',
      'decisions,skills',
      '--enable',
    ],
    { cwd: rootDir, encoding: 'utf8' },
  );
  const config = YAML.parse(fs.readFileSync(path.join(configDir, 'legionaries.yaml'), 'utf8'));

  assert.match(output, /Enabled domain product-ops/);
  assert.deepEqual(config.domains, {
    coding: true,
    'product-ops': true,
  });

  const checkOutput = execFileSync('bun', ['src/cli.ts', 'check', '--worktree', rootDir, '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  assert.match(checkOutput, /Static domain catalog: PASS/);
});

test('install cli accepts pickable domains with coding as default', t => {
  const configDir = makeTempDir(t, 'your-legion-install-cli-domains');

  const output = execFileSync(
    'bun',
    ['src/cli.ts', 'install', '--config-dir', configDir, '--domains', 'coding,marketing,finance,accounting'],
    { cwd: rootDir, encoding: 'utf8' },
  );
  const config = YAML.parse(fs.readFileSync(path.join(configDir, 'legionaries.yaml'), 'utf8'));

  assert.match(output, /Enabled domains: coding, marketing, finance, accounting/);
  assert.match(output, /Created .*legionaries\.yaml/);
  assert.deepEqual(Object.keys(config.domains), ['coding', 'marketing', 'finance', 'accounting']);
});

test('install cli preserves existing domains on reinstall without domain flags', t => {
  const configDir = makeTempDir(t, 'your-legion-install-cli-preserve');

  execFileSync('bun', ['src/cli.ts', 'install', '--config-dir', configDir, '--domains', 'coding,marketing'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  const output = execFileSync('bun', ['src/cli.ts', 'install', '--config-dir', configDir], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  const config = YAML.parse(fs.readFileSync(path.join(configDir, 'legionaries.yaml'), 'utf8'));

  assert.match(output, /Preserved .*legionaries\.yaml/);
  assert.deepEqual(config.domains, {
    coding: true,
    marketing: true,
  });
});

test('install cli adds domains without removing existing domains', t => {
  const configDir = makeTempDir(t, 'your-legion-install-cli-add-domains');

  execFileSync('bun', ['src/cli.ts', 'install', '--config-dir', configDir, '--domains', 'coding,marketing'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  const output = execFileSync(
    'bun',
    ['src/cli.ts', 'install', '--config-dir', configDir, '--add-domains', 'finance,accounting'],
    { cwd: rootDir, encoding: 'utf8' },
  );
  const config = YAML.parse(fs.readFileSync(path.join(configDir, 'legionaries.yaml'), 'utf8'));

  assert.match(output, /Updated .*legionaries\.yaml/);
  assert.deepEqual(config.domains, {
    coding: true,
    marketing: true,
    finance: true,
    accounting: true,
  });
});

test('install cli accepts a previously created custom domain', t => {
  const configDir = makeTempDir(t, 'your-legion-install-cli-custom-domain');

  execFileSync(
    'bun',
    ['src/cli.ts', 'create-domain', 'product-ops', '--config-dir', configDir, '--components', 'decisions'],
    { cwd: rootDir, encoding: 'utf8' },
  );
  const output = execFileSync(
    'bun',
    ['src/cli.ts', 'install', '--config-dir', configDir, '--domains', 'coding,product-ops'],
    { cwd: rootDir, encoding: 'utf8' },
  );
  const config = YAML.parse(fs.readFileSync(path.join(configDir, 'legionaries.yaml'), 'utf8'));

  assert.match(output, /Enabled domains: coding, product-ops/);
  assert.deepEqual(config.domains, {
    coding: true,
    'product-ops': true,
  });
});

test('legionaries config resolution falls back to global opencode config dir', async t => {
  const projectDir = makeTempDir(t, 'your-legion-project');
  const configDir = makeTempDir(t, 'your-legion-global-config');
  fs.copyFileSync(path.join(rootDir, 'legionaries.yaml'), path.join(configDir, 'legionaries.yaml'));
  const { resolveLegionariesConfigPath } = await import('../src/config/legionaries');

  const result = resolveLegionariesConfigPath({
    rootDir: projectDir,
    configDir,
  });

  assert.equal(result, path.join(configDir, 'legionaries.yaml'));
});

test('legionaries config resolution prefers project config over global config dir', async t => {
  const projectDir = makeTempDir(t, 'your-legion-project-local');
  const configDir = makeTempDir(t, 'your-legion-global-config-local');
  fs.writeFileSync(path.join(projectDir, 'legionaries.yaml'), 'agents: {}\n');
  fs.writeFileSync(path.join(configDir, 'legionaries.yaml'), 'agents: { global: true }\n');
  const { resolveLegionariesConfigPath } = await import('../src/config/legionaries');

  const result = resolveLegionariesConfigPath({
    rootDir: projectDir,
    configDir,
  });

  assert.equal(result, path.join(projectDir, 'legionaries.yaml'));
});

test('build publishes the installer template under dist', () => {
  fs.mkdirSync(path.join(rootDir, 'dist'), { recursive: true });
  execFileSync('bun', ['run', 'build'], { cwd: rootDir, stdio: 'ignore' });

  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'legionaries.yaml'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'legionaries.yaml'), 'utf8'),
  );
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'custom-agents', 'code-reviewer.yaml'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'src', 'custom-agents', 'code-reviewer.yaml'), 'utf8'),
  );
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'domains', 'coding', 'skills', 'make-code-change', 'SKILL.md'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'src', 'domains', 'coding', 'skills', 'make-code-change', 'SKILL.md'), 'utf8'),
  );
  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'domains', 'marketing', 'skills', 'campaign-brief', 'SKILL.md'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'src', 'domains', 'marketing', 'skills', 'campaign-brief', 'SKILL.md'), 'utf8'),
  );
  assert.equal(
    fs.readFileSync(
      path.join(rootDir, 'dist', 'domains', 'finance', 'skills', 'financial-analysis', 'SKILL.md'),
      'utf8',
    ),
    fs.readFileSync(
      path.join(rootDir, 'src', 'domains', 'finance', 'skills', 'financial-analysis', 'SKILL.md'),
      'utf8',
    ),
  );
  assert.equal(
    fs.readFileSync(
      path.join(rootDir, 'dist', 'domains', 'accounting', 'skills', 'apply-accounting-review', 'SKILL.md'),
      'utf8',
    ),
    fs.readFileSync(
      path.join(rootDir, 'src', 'domains', 'accounting', 'skills', 'apply-accounting-review', 'SKILL.md'),
      'utf8',
    ),
  );
});
