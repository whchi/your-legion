import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import type { EffectiveAgentConfig } from '../src/shared/agent-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const legionariesConfigPath = path.join(rootDir, 'legionaries.yaml');
const packageJsonPath = path.join(rootDir, 'package.json');
const tempDir = path.join(rootDir, 'temp');

function systemAgentsFrom(config: Record<string, any>): Record<string, any> {
  return config.system_agents ?? config.agents;
}

test('plugin runtime builds the full agent config from the mixed legionaries map', async () => {
  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config');
  const result = await buildEffectiveAgentConfig({
    rootDir: new URL('../', import.meta.url),
    configPath: legionariesConfigPath,
  });

  assert.equal(result.default_agent, 'orchestrator');
  assert.equal(result.agent.orchestrator.model, 'openai/gpt-5.5');
  assert.deepEqual(result.agent.orchestrator.options?.reasoning, {
    effort: 'medium',
  });
  assert.equal(result.agent.builder.model, 'opencode-go/kimi-k2.6');
  assert.equal(result.agent.explorer.model, 'opencode-go/deepseek-v4-flash');
  assert.equal(result.agent.librarian.model, 'opencode-go/minimax-m2.7');
  assert.equal(result.agent['code-reviewer'].model, 'openai/gpt-5.5');
  assert.match(result.agent['code-reviewer'].prompt, /Findings/i);
  assert.ok(!('dispatcher' in result.agent));
  assert.ok(!('frontend-developer' in result.agent));
});

test('plugin runtime supports alternate mixed legionaries config files', async () => {
  fs.mkdirSync(tempDir, { recursive: true });
  const tempConfigPath = path.join(tempDir, 'legionaries.override.yaml');
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
          model: 'openai/gpt-5-mini',
        },
        librarian: {
          model: 'github-copilot/grok-code-fast-1',
        },
      },
      custom_agents: {
        'code-reviewer': {
          model: 'openai/gpt-5.5',
          reasoning: {
            effort: 'high',
          },
        },
      },
    }),
  );

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config');
  const result = await buildEffectiveAgentConfig({
    rootDir: new URL('../', import.meta.url),
    configPath: new URL(tempConfigPath, 'file://'),
  });

  assert.equal(result.agent.orchestrator.model, 'github-copilot/claude-opus-4.1');
  assert.deepEqual(result.agent.orchestrator.options?.reasoning, {
    effort: 'medium',
  });
  assert.equal(result.agent.builder.model, 'openai/gpt-5-mini');
  assert.equal(result.agent.librarian.model, 'github-copilot/grok-code-fast-1');
  assert.equal(result.agent['code-reviewer'].mode, 'subagent');
  assert.equal(result.agent['code-reviewer'].model, 'openai/gpt-5.5');
  assert.deepEqual(result.agent['code-reviewer'].options?.reasoning, {
    effort: 'high',
  });
});

test('package metadata uses the published package name', () => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  assert.equal(pkg.name, '@whchi/your-legion');
});

test('package root exports the OpenCode plugin entrypoint', () => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  assert.equal(pkg.exports['.'], './dist/server.js');
  assert.equal(pkg.exports['./server'], './dist/server.js');
});

test('package exposes the installer CLI', () => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  assert.equal(pkg.bin['your-legion'], './dist/cli.js');
});

test('plugin entrypoint exports domain scaffold helper for agent scripts', async () => {
  const pluginModule = await import('../src/index');

  assert.equal(typeof pluginModule.createDomainPack, 'function');
});

test('package publishes build and install artifacts from dist', () => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  assert.deepEqual(pkg.files, ['dist', 'README.md']);
});

test('plugin server exposes a config hook that injects Your Legion agents', async () => {
  const pluginModule = await import('../src/index');

  assert.equal(pluginModule.default.id, 'your-legion');

  const hooks = await pluginModule.default.server(
    {
      client: {},
      project: {},
      directory: new URL('../', import.meta.url).pathname,
      worktree: new URL('../', import.meta.url).pathname,
      experimental_workspace: { register() {} },
      serverUrl: new URL('http://localhost'),
      $: {},
    },
    {
      configPath: legionariesConfigPath,
    },
  );

  assert.equal(typeof hooks.config, 'function');

  const config: Partial<EffectiveAgentConfig> = {};
  await hooks.config(config);

  assert.equal(config.default_agent, 'orchestrator');
  assert.equal(config.agent?.orchestrator.model, 'openai/gpt-5.5');
  assert.deepEqual(config.agent?.orchestrator.options?.reasoning, {
    effort: 'medium',
  });
  assert.equal(config.agent?.builder.mode, 'subagent');
  assert.equal(config.agent?.['code-reviewer'].mode, 'subagent');
  assert.ok(config.agent && !('dispatcher' in config.agent));
  assert.ok(config.agent && !('frontend-developer' in config.agent));
});
