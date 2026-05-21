import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
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

function makeTempDir(t: TestContext, name: string) {
  fs.mkdirSync(tempDir, { recursive: true });
  const dir = fs.mkdtempSync(path.join(tempDir, `${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeCustomAgent(
  dir: string,
  name: string,
  description: string,
  permission: Record<string, unknown> = { read: 'allow' },
) {
  const agentsDir = path.join(dir, 'src', 'custom-agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentsDir, `${name}.yaml`),
    YAML.stringify({
      name,
      description,
      permission,
      prompt: `# ${name}\n\nCustom runtime agent`,
    }),
  );
}

function writeLiteralCustomAgent(dir: string, name: string, text: string) {
  const agentsDir = path.join(dir, 'src', 'custom-agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(path.join(agentsDir, `${name}.yaml`), text);
}

test('custom agent provider discovers configured YAML custom agents from src/custom-agents', async t => {
  const projectDir = makeTempDir(t, 'custom-agent-project');
  const configPath = path.join(projectDir, 'legionaries.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  writeCustomAgent(projectDir, 'scribe', 'Writes release notes and changelogs', {
    read: 'allow',
    webfetch: 'allow',
  });
  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgents,
      custom_agents: {
        scribe: {
          model: 'openai/gpt-5.5',
          reasoning: {
            effort: 'low',
          },
        },
      },
    }),
  );

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config');
  const result = await buildEffectiveAgentConfig({
    rootDir: projectDir,
    configPath,
  });

  assert.equal(result.agent.scribe.description, 'Writes release notes and changelogs');
  assert.equal(result.agent.scribe.model, 'openai/gpt-5.5');
  assert.deepEqual(result.agent.scribe.options?.reasoning, { effort: 'low' });
  assert.equal(result.agent.scribe.mode, 'subagent');
  assert.equal(result.agent.scribe.permission.read, 'allow');
  assert.equal(result.agent.scribe.permission.webfetch, 'allow');
  assert.equal(result.agent.scribe.permission.edit, 'deny');
  assert.equal(result.agent.scribe.permission.glob, 'deny');
  assert.equal((result.agent.orchestrator.permission.task as Record<string, unknown>).scribe, 'allow');
  assert.match(result.agent.orchestrator.prompt, /scribe/);
  assert.match(result.agent.orchestrator.prompt, /Writes release notes and changelogs/);
});

test('custom agent provider accepts the documented YAML prompt format', async t => {
  const projectDir = makeTempDir(t, 'custom-agent-document-format');
  const configPath = path.join(projectDir, 'legionaries.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  writeLiteralCustomAgent(
    projectDir,
    'heloman',
    `name: heloman
description: I am a helo test agent here
permission:
      read: 'allow'
prompt: |-
  response hello to everyone
`,
  );
  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgents,
      custom_agents: {
        heloman: 'openai/gpt-5.5',
      },
    }),
  );

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config');
  const result = await buildEffectiveAgentConfig({
    rootDir: projectDir,
    configPath,
  });

  assert.equal(result.agent.heloman.description, 'I am a helo test agent here');
  assert.equal(result.agent.heloman.permission.read, 'allow');
  assert.equal(result.agent.heloman.permission.glob, 'deny');
  assert.match(result.agent.heloman.prompt, /response hello to everyone/);
});

test('repo code-reviewer custom agent is injected from custom-agents example', async () => {
  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config');
  const result = await buildEffectiveAgentConfig({
    rootDir,
    configPath: legionariesConfigPath,
  });

  assert.equal(result.agent['code-reviewer'].mode, 'subagent');
  assert.equal(result.agent['code-reviewer'].model, 'openai/gpt-5.5');
  assert.equal(result.agent['code-reviewer'].permission.edit, 'deny');
  assert.match(result.agent['code-reviewer'].prompt, /Findings/i);
  assert.equal((result.agent.orchestrator.permission.task as Record<string, unknown>)['code-reviewer'], 'allow');
});

test('custom agent provider rejects attempts to replace system agents', async t => {
  const projectDir = makeTempDir(t, 'custom-agent-system-collision');
  const configPath = path.join(projectDir, 'legionaries.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  writeCustomAgent(projectDir, 'builder', 'Replacement builder');
  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgents,
      custom_agents: {
        builder: 'openai/gpt-5.5',
      },
    }),
  );

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config');

  await assert.rejects(
    () =>
      buildEffectiveAgentConfig({
        rootDir: projectDir,
        configPath,
      }),
    /custom agent cannot replace system agent: builder/,
  );
});

test('configured custom agents must have a discovered definition file', async t => {
  const projectDir = makeTempDir(t, 'custom-agent-missing-definition');
  const configPath = path.join(projectDir, 'legionaries.yaml');
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'));
  const systemAgents = systemAgentsFrom(original);

  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgents,
      custom_agents: {
        scribe: 'openai/gpt-5.5',
      },
    }),
  );

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config');

  await assert.rejects(
    () =>
      buildEffectiveAgentConfig({
        rootDir: projectDir,
        configPath,
      }),
    /missing custom agent definition for configured agent: scribe/,
  );
});
