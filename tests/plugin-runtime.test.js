import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const providerConfigPath = path.join(rootDir, 'agent-providers.yaml')
const packageJsonPath = path.join(rootDir, 'package.json')
const opencodeConfigPath = path.join(rootDir, 'opencode.jsonc')
const tempDir = path.join(rootDir, 'temp')

test('plugin runtime builds the full agent config from the mixed provider map', async () => {
  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir: new URL('../', import.meta.url),
  })

  assert.equal(result.default_agent, 'orchestrator')
  assert.equal(result.agent.orchestrator.model, 'openai/gpt-5.5')
  assert.deepEqual(result.agent.orchestrator.options.reasoning, { effort: 'medium' })
  assert.equal(result.agent.dispatcher.model, 'opencode-go/glm-5.1')
  assert.equal(result.agent.builder.model, 'opencode-go/kimi-k2.6')
  assert.equal(result.agent['frontend-developer'].model, 'github-copilot/gemini-3.1-pro-preview')
  assert.equal(result.agent.explorer.model, 'opencode-go/deepseek-v4-flash')
  assert.equal(result.agent.librarian.model, 'opencode-go/minimax-m2.7')
})

test('plugin runtime supports alternate mixed provider config files', async () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const tempConfigPath = path.join(tempDir, 'agent-providers.override.yaml')
  const original = YAML.parse(fs.readFileSync(providerConfigPath, 'utf8'))

  fs.writeFileSync(
    tempConfigPath,
    YAML.stringify({
      agents: {
        ...original.agents,
        orchestrator: {
          model: 'github-copilot/claude-opus-4.1',
          reasoning: {
            effort: 'medium',
          },
        },
        'frontend-developer': {
          model: 'openai/gpt-5-mini',
        },
        librarian: {
          model: 'github-copilot/grok-code-fast-1',
        },
      },
    }),
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir: new URL('../', import.meta.url),
    configPath: new URL(tempConfigPath, 'file://'),
  })

  assert.equal(result.agent.orchestrator.model, 'github-copilot/claude-opus-4.1')
  assert.deepEqual(result.agent.orchestrator.options.reasoning, { effort: 'medium' })
  assert.equal(result.agent['frontend-developer'].model, 'openai/gpt-5-mini')
  assert.equal(result.agent.librarian.model, 'github-copilot/grok-code-fast-1')
})

test('package metadata and project config use the published package name', () => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  const projectConfig = JSON.parse(fs.readFileSync(opencodeConfigPath, 'utf8'))

  assert.equal(pkg.name, '@whchi/your-legion')
  assert.deepEqual(projectConfig.plugin, ['@whchi/your-legion'])
})

test('package root exports the OpenCode plugin entrypoint', () => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  assert.equal(pkg.exports['.'], './dist/server.js')
  assert.equal(pkg.exports['./server'], './dist/server.js')
})

test('package exposes the installer CLI', () => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  assert.equal(pkg.bin['your-legion'], './dist/cli.js')
})

test('package publishes build and install artifacts from dist', () => {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  assert.deepEqual(pkg.files, ['dist', 'README.md', 'DEVELOPMENT.md', 'AGENTS.md'])
})

test('plugin server exposes a config hook that injects Your Legion agents', async () => {
  const pluginModule = await import('../src/index.ts')

  assert.equal(pluginModule.default.id, 'your-legion')

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
    {},
  )

  assert.equal(typeof hooks.config, 'function')

  const config = {}
  await hooks.config(config)

  assert.equal(config.default_agent, 'orchestrator')
  assert.equal(config.agent.orchestrator.model, 'openai/gpt-5.5')
  assert.deepEqual(config.agent.orchestrator.options.reasoning, { effort: 'medium' })
  assert.equal(config.agent['code-reviewer'].mode, 'subagent')
  assert.equal(config.agent.builder.mode, 'subagent')
  assert.equal(config.agent['frontend-developer'].mode, 'subagent')
})
