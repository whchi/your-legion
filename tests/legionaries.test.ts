import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const legionariesConfigPath = path.join(rootDir, 'legionaries.yaml');
const tempDir = path.join(rootDir, 'temp');

function systemAgentsFrom(config: Record<string, any>): Record<string, any> {
  return config.system_agents ?? config.agents;
}

test('legionaries config file defines a mixed system-agent model map', () => {
  const text = fs.readFileSync(legionariesConfigPath, 'utf8');
  const config = YAML.parse(text);

  assert.ok(config.system_agents);
  assert.equal(config.custom_agents['code-reviewer'].model, 'openai/gpt-5.5');
  assert.equal(config.system_agents.orchestrator.model, 'openai/gpt-5.5');
  assert.equal(config.system_agents.orchestrator.reasoning.effort, 'medium');
  assert.equal(config.system_agents.explorer.model, 'opencode-go/deepseek-v4-flash');
  assert.equal(config.system_agents.librarian.model, 'opencode-go/minimax-m2.7');
  assert.equal(config.system_agents.builder.model, 'opencode-go/kimi-k2.6');
  assert.ok(!('dispatcher' in config.system_agents));
  assert.ok(!('frontend-developer' in config.system_agents));
  assert.ok(!('code-reviewer' in config.system_agents));
});

test('legionaries template explains model choice by agent responsibility', () => {
  const text = fs.readFileSync(legionariesConfigPath, 'utf8');

  assert.match(text, /orchestrator.*routing.*context handoff/i);
  assert.match(text, /explorer.*fast.*repo discovery/i);
  assert.match(text, /librarian.*documentation.*reference/i);
  assert.match(text, /planner.*reasoning.*sequencing/i);
  assert.match(text, /builder.*coding-capable.*execution/i);
  assert.doesNotMatch(text, /\bprofile:|\bpreset:|\brole_type:/);
});

test('public docs position provider mapping before diagnostics', () => {
  const readme = fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8');
  const configuration = fs.readFileSync(path.join(rootDir, 'docs', 'CONFIGURATION.md'), 'utf8');

  assert.ok(
    readme.indexOf('per-agent provider/model mapping') !== -1 &&
      readme.indexOf('per-agent provider/model mapping') < readme.indexOf('doctor'),
  );
  assert.match(configuration, /How To Choose Models/i);
  assert.ok(configuration.indexOf('How To Choose Models') < configuration.indexOf('Domain Packs'));
});

test('legionaries loader resolves the mixed system-agent model map', async () => {
  const { loadLegionariesConfig } = await import('../src/config/legionaries');
  const result = loadLegionariesConfig({ rootDir, configPath: legionariesConfigPath });

  assert.equal(result.systemAgents.orchestrator.model, 'openai/gpt-5.5');
  assert.deepEqual(result.systemAgents.orchestrator.reasoning, {
    effort: 'medium',
  });
  assert.equal(result.systemAgents.explorer.model, 'opencode-go/deepseek-v4-flash');
  assert.equal(result.systemAgents.librarian.model, 'opencode-go/minimax-m2.7');
  assert.equal(result.systemAgents.builder.model, 'opencode-go/kimi-k2.6');
  assert.equal(result.customAgents['code-reviewer'].model, 'openai/gpt-5.5');
  assert.ok(!('dispatcher' in result.systemAgents));
  assert.ok(!('frontend-developer' in result.systemAgents));
  assert.ok(!('code-reviewer' in result.systemAgents));
});

test('legionaries loader supports per-agent overrides via config override', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.loader-override.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  fs.writeFileSync(
    tempConfigPath,
    YAML.stringify({
      system_agents: {
        ...systemAgents,
        orchestrator: {
          model: 'github-copilot/claude-opus-4.1',
          reasoning: {
            effort: 'medium',
          },
        },
        builder: {
          model: 'github-copilot/gemini-3.1-pro-preview',
        },
      },
    }),
  );

  const { loadLegionariesConfig } = await import('../src/config/legionaries');
  const result = loadLegionariesConfig({ rootDir, configPath: tempConfigPath });

  assert.equal(result.systemAgents.orchestrator.model, 'github-copilot/claude-opus-4.1');
  assert.deepEqual(result.systemAgents.orchestrator.reasoning, {
    effort: 'medium',
  });
  assert.equal(result.systemAgents.builder.model, 'github-copilot/gemini-3.1-pro-preview');
});

test('legionaries loader accepts custom_agents with the same entry shape', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.custom-agents.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  fs.writeFileSync(
    tempConfigPath,
    YAML.stringify({
      system_agents: systemAgents,
      custom_agents: {
        scribe: {
          model: 'openai/gpt-5.5',
          reasoning: {
            effort: 'low',
          },
        },
        analyst: 'github-copilot/claude-opus-4.1',
      },
    }),
  );

  const { loadLegionariesConfig } = await import('../src/config/legionaries');
  const result = loadLegionariesConfig({ rootDir, configPath: tempConfigPath });

  assert.equal(result.customAgents.scribe.model, 'openai/gpt-5.5');
  assert.deepEqual(result.customAgents.scribe.reasoning, { effort: 'low' });
  assert.equal(result.customAgents.analyst.model, 'github-copilot/claude-opus-4.1');
});

test('legionaries loader supports legacy agents map when new keys are absent', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.legacy-agents.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  fs.writeFileSync(
    tempConfigPath,
    YAML.stringify({
      agents: systemAgents,
    }),
  );

  const { loadLegionariesConfig } = await import('../src/config/legionaries');
  const result = loadLegionariesConfig({ rootDir, configPath: tempConfigPath });

  assert.equal(result.systemAgents.orchestrator.model, 'openai/gpt-5.5');
  assert.deepEqual(result.customAgents, {});
});

test('legionaries loader rejects missing agent model mappings', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.missing-model.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  delete systemAgents.planner.model;
  original.system_agents = systemAgents;
  delete original.agents;
  fs.writeFileSync(tempConfigPath, YAML.stringify(original));

  const { loadLegionariesConfig } = await import('../src/config/legionaries');

  assert.throws(
    () => loadLegionariesConfig({ rootDir, configPath: tempConfigPath }),
    /missing model for agent: planner/,
  );
});

test('legionaries loader rejects invalid model formats', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.invalid-model.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  systemAgents.planner.model = 'invalid-model-format';
  original.system_agents = systemAgents;
  delete original.agents;
  fs.writeFileSync(tempConfigPath, YAML.stringify(original));

  const { loadLegionariesConfig } = await import('../src/config/legionaries');

  assert.throws(
    () => loadLegionariesConfig({ rootDir, configPath: tempConfigPath }),
    /invalid model format for planner: invalid-model-format/,
  );
});

test('legionaries loader rejects invalid reasoning effort values', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.invalid-reasoning.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  systemAgents.orchestrator.reasoning.effort = 'extreme';
  original.system_agents = systemAgents;
  delete original.agents;
  fs.writeFileSync(tempConfigPath, YAML.stringify(original));

  const { loadLegionariesConfig } = await import('../src/config/legionaries');

  assert.throws(
    () => loadLegionariesConfig({ rootDir, configPath: tempConfigPath }),
    /invalid reasoning effort for orchestrator: extreme/,
  );
});

test('legionaries loader accepts xhigh and max reasoning effort values', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.reasoning-variants.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  systemAgents.orchestrator.reasoning.effort = 'xhigh';
  systemAgents.planner = {
    model: 'openai/gpt-5.4',
    reasoning: {
      effort: 'max',
    },
  };
  original.system_agents = systemAgents;
  delete original.agents;

  fs.writeFileSync(tempConfigPath, YAML.stringify(original));

  const { loadLegionariesConfig } = await import('../src/config/legionaries');
  const result = loadLegionariesConfig({ rootDir, configPath: tempConfigPath });

  assert.deepEqual(result.systemAgents.orchestrator.reasoning, {
    effort: 'xhigh',
  });
  assert.deepEqual(result.systemAgents.planner.reasoning, { effort: 'max' });
});

test('legionaries loader rejects system agent names under custom_agents', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.custom-system-collision.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  fs.writeFileSync(
    tempConfigPath,
    YAML.stringify({
      system_agents: systemAgents,
      custom_agents: {
        explorer: 'openai/gpt-5.5',
      },
    }),
  );

  const { loadLegionariesConfig } = await import('../src/config/legionaries');

  assert.throws(
    () => loadLegionariesConfig({ rootDir, configPath: tempConfigPath }),
    /custom agent cannot replace system agent: explorer/,
  );
});

test('temp artifacts live under temp/ and temp/ is gitignored', () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const artifactPath = path.join(tempDir, 'temp-artifact.txt');
  fs.writeFileSync(artifactPath, 'temp artifact\n');

  assert.ok(fs.existsSync(artifactPath));
  assert.match(path.relative(rootDir, artifactPath), /^temp\//);

  const gitignore = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8');
  assert.match(gitignore, /^temp\/\s*$/m);
});
