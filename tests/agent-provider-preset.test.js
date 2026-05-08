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
const tempDir = path.join(rootDir, 'temp')

test('provider config file defines a mixed per-agent model map', () => {
  const text = fs.readFileSync(providerConfigPath, 'utf8')
  const config = YAML.parse(text)

  assert.ok(config.agents)
  assert.equal(config.agents.orchestrator.model, 'openai/gpt-5.5')
  assert.equal(config.agents.orchestrator.reasoning.effort, 'medium')
  assert.equal(config.agents.dispatcher.model, 'github-copilot/claude-sonnet-4')
  assert.equal(config.agents.explorer.model, 'opencode-go/deepseek-v4-flash')
  assert.equal(config.agents.librarian.model, 'opencode-go/minimax-m2.7')
  assert.equal(config.agents.builder.model, 'opencode-go/kimi-k2.6')
  assert.equal(config.agents['frontend-developer'].model, 'github-copilot/gemini-3.1-pro-preview')
})

test('provider loader resolves the mixed per-agent model map', async () => {
  const { loadAgentProviderConfig } = await import('../src/config/agent-providers.ts')
  const result = loadAgentProviderConfig({ rootDir })

  assert.equal(result.agents.orchestrator.model, 'openai/gpt-5.5')
  assert.deepEqual(result.agents.orchestrator.reasoning, { effort: 'medium' })
  assert.equal(result.agents.dispatcher.model, 'github-copilot/claude-sonnet-4')
  assert.equal(result.agents.explorer.model, 'opencode-go/deepseek-v4-flash')
  assert.equal(result.agents.librarian.model, 'opencode-go/minimax-m2.7')
  assert.equal(result.agents.builder.model, 'opencode-go/kimi-k2.6')
  assert.equal(result.agents['frontend-developer'].model, 'github-copilot/gemini-3.1-pro-preview')
})

test('provider loader supports per-agent overrides via config override', async () => {
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
          model: 'github-copilot/gemini-3.1-pro-preview',
        },
      },
    }),
  )

  const { loadAgentProviderConfig } = await import('../src/config/agent-providers.ts')
  const result = loadAgentProviderConfig({ rootDir, configPath: tempConfigPath })

  assert.equal(result.agents.orchestrator.model, 'github-copilot/claude-opus-4.1')
  assert.deepEqual(result.agents.orchestrator.reasoning, { effort: 'medium' })
  assert.equal(result.agents['frontend-developer'].model, 'github-copilot/gemini-3.1-pro-preview')
})

test('provider loader rejects missing agent model mappings', async () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const tempConfigPath = path.join(tempDir, 'agent-providers.missing-model.yaml')
  const original = YAML.parse(fs.readFileSync(providerConfigPath, 'utf8'))

  delete original.agents.planner.model
  fs.writeFileSync(tempConfigPath, YAML.stringify(original))

  const { loadAgentProviderConfig } = await import('../src/config/agent-providers.ts')

  assert.throws(
    () => loadAgentProviderConfig({ rootDir, configPath: tempConfigPath }),
    /missing model for agent: planner/,
  )
})

test('provider loader rejects invalid model formats', async () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const tempConfigPath = path.join(tempDir, 'agent-providers.invalid-model.yaml')
  const original = YAML.parse(fs.readFileSync(providerConfigPath, 'utf8'))

  original.agents.planner.model = 'invalid-model-format'
  fs.writeFileSync(tempConfigPath, YAML.stringify(original))

  const { loadAgentProviderConfig } = await import('../src/config/agent-providers.ts')

  assert.throws(
    () => loadAgentProviderConfig({ rootDir, configPath: tempConfigPath }),
    /invalid model format for planner: invalid-model-format/,
  )
})

test('provider loader rejects invalid reasoning effort values', async () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const tempConfigPath = path.join(tempDir, 'agent-providers.invalid-reasoning.yaml')
  const original = YAML.parse(fs.readFileSync(providerConfigPath, 'utf8'))

  original.agents.orchestrator.reasoning.effort = 'extreme'
  fs.writeFileSync(tempConfigPath, YAML.stringify(original))

  const { loadAgentProviderConfig } = await import('../src/config/agent-providers.ts')

  assert.throws(
    () => loadAgentProviderConfig({ rootDir, configPath: tempConfigPath }),
    /invalid reasoning effort for orchestrator: extreme/,
  )
})

test('provider loader accepts xhigh and max reasoning effort values', async () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const tempConfigPath = path.join(tempDir, 'agent-providers.reasoning-variants.yaml')
  const original = YAML.parse(fs.readFileSync(providerConfigPath, 'utf8'))

  original.agents.orchestrator.reasoning.effort = 'xhigh'
  original.agents.planner = {
    model: 'openai/gpt-5.4',
    reasoning: {
      effort: 'max',
    },
  }

  fs.writeFileSync(tempConfigPath, YAML.stringify(original))

  const { loadAgentProviderConfig } = await import('../src/config/agent-providers.ts')
  const result = loadAgentProviderConfig({ rootDir, configPath: tempConfigPath })

  assert.deepEqual(result.agents.orchestrator.reasoning, { effort: 'xhigh' })
  assert.deepEqual(result.agents.planner.reasoning, { effort: 'max' })
})

test('temp artifacts live under temp/ and temp/ is gitignored', () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const artifactPath = path.join(tempDir, 'temp-artifact.txt')
  fs.writeFileSync(artifactPath, 'temp artifact\n')

  assert.ok(fs.existsSync(artifactPath))
  assert.match(path.relative(rootDir, artifactPath), /^temp\//)

  const gitignore = fs.readFileSync(path.join(rootDir, '.gitignore'), 'utf8')
  assert.match(gitignore, /^temp\/\s*$/m)
})
