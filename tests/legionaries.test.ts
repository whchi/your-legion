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

type TestAgentEntry = {
  model?: string;
  reasoning?: {
    effort?: string;
  };
};

function systemAgentsFrom(config: Record<string, unknown>): Record<string, TestAgentEntry> {
  return config.system_agents as Record<string, TestAgentEntry>;
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
  assert.equal(config.system_agents.verifier.model, 'openai/gpt-5.5');
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
  assert.match(text, /verifier.*checker.*completion/i);
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

test('legion loop docs explain every user-facing loop parameter', () => {
  const loopsDoc = fs.readFileSync(path.join(rootDir, 'docs', 'LEGION_LOOPS.md'), 'utf8');

  assert.match(loopsDoc, /## Quick Start/i);
  assert.match(loopsDoc, /## Presets/i);
  assert.match(loopsDoc, /## Parameter Reference/i);
  for (const field of [
    'description',
    'objective',
    'trigger.type',
    'trigger.cadence',
    'inbox_path',
    'active_domains',
    'domain_refs',
    'domain_skills',
    'agents.triage',
    'agents.maker',
    'agents.verifier',
    'worktree.isolation',
    'verification.commands',
    'verification.completion',
    'connectors.mode',
    'connectors.targets',
  ]) {
    assert.match(loopsDoc, new RegExp(`\\\`${field}\\\``));
  }
});

test('public loop docs do not promote old manual setup paths', () => {
  const publicDocs = [
    fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'docs', 'CONFIGURATION.md'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'docs', 'EXAMPLES.md'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'docs', 'LEGION_LOOPS.md'), 'utf8'),
  ].join('\n');
  const loopsDoc = fs.readFileSync(path.join(rootDir, 'docs', 'LEGION_LOOPS.md'), 'utf8');

  assert.doesNotMatch(publicDocs, /create-loop daily-ci-triage --worktree \. --description/);
  assert.doesNotMatch(publicDocs, /Then tune the generated/i);
  assert.doesNotMatch(publicDocs, /loop-scenarios/);
  assert.doesNotMatch(publicDocs, /inheriting the `builder` model/i);
  assert.doesNotMatch(loopsDoc, /## Commands/i);
  assert.doesNotMatch(loopsDoc, /The first implementation/i);
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
  assert.equal(result.systemAgents.verifier.model, 'openai/gpt-5.5');
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

test('legionaries loader rejects old agents map', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.old-agents.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  fs.writeFileSync(
    tempConfigPath,
    YAML.stringify({
      agents: systemAgents,
    }),
  );

  const { loadLegionariesConfig } = await import('../src/config/legionaries');

  assert.throws(
    () => loadLegionariesConfig({ rootDir, configPath: tempConfigPath }),
    /legionaries.yaml missing system_agents map/,
  );
});

test('legionaries loader accepts loop contracts', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.loops.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  fs.writeFileSync(
    tempConfigPath,
    YAML.stringify({
      system_agents: systemAgents,
      loops: {
        'daily-ci-triage': {
          description: 'Daily CI and issue triage loop',
          objective: 'Find actionable CI failures and produce verified fixes',
          trigger: {
            type: 'scheduled',
            cadence: 'daily',
          },
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
            commands: ['bun test'],
            completion: 'All commands pass and verifier reports no high findings',
          },
          connectors: {
            mode: 'manual',
            targets: [],
          },
        },
      },
    }),
  );

  const { loadLegionariesConfig } = await import('../src/config/legionaries');
  const result = loadLegionariesConfig({ rootDir, configPath: tempConfigPath });

  assert.equal(result.loops['daily-ci-triage'].trigger.type, 'scheduled');
  assert.equal(result.loops['daily-ci-triage'].agents.verifier, 'verifier');
  assert.deepEqual(result.loops['daily-ci-triage'].verification.commands, ['bun test']);
});

test('legionaries loader rejects unsafe loop inbox paths', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.loop-absolute-inbox.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  fs.writeFileSync(
    tempConfigPath,
    YAML.stringify({
      system_agents: systemAgents,
      loops: {
        'bad-loop': {
          description: 'Bad loop',
          objective: 'Demonstrate validation',
          trigger: { type: 'manual' },
          inbox_path: '/tmp/bad-loop.md',
          verification: { commands: ['bun test'], completion: 'Tests pass' },
        },
      },
    }),
  );

  const { loadLegionariesConfig } = await import('../src/config/legionaries');

  assert.throws(
    () => loadLegionariesConfig({ rootDir, configPath: tempConfigPath }),
    /loops\.bad-loop\.inbox_path must be a relative repo path/,
  );
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

test('legionaries loader explains missing verifier mapping for old configs', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.missing-verifier.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  delete systemAgents.verifier;
  original.system_agents = systemAgents;
  delete original.agents;
  fs.writeFileSync(tempConfigPath, YAML.stringify(original));

  const { loadLegionariesConfig } = await import('../src/config/legionaries');

  assert.throws(
    () => loadLegionariesConfig({ rootDir, configPath: tempConfigPath }),
    /missing model for required system agent: verifier/,
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
