import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const legionariesConfigPath = path.join(rootDir, 'legionaries.yaml')
const tempDir = path.join(rootDir, 'temp')

test('legionaries config file defines a mixed per-agent model map', () => {
  const text = fs.readFileSync(legionariesConfigPath, 'utf8')
  const config = YAML.parse(text)

  assert.ok(config.agents)
  assert.equal(config.agents.orchestrator.model, 'openai/gpt-5.5')
  assert.equal(config.agents.orchestrator.reasoning.effort, 'medium')
  assert.equal(config.agents.explorer.model, 'opencode-go/deepseek-v4-flash')
  assert.equal(config.agents.librarian.model, 'opencode-go/minimax-m2.7')
  assert.equal(config.agents.builder.model, 'opencode-go/kimi-k2.6')
  assert.ok(!('dispatcher' in config.agents))
  assert.ok(!('frontend-developer' in config.agents))
  assert.ok(!('code-reviewer' in config.agents))
})

test('legionaries loader resolves the mixed per-agent model map', async () => {
  const { loadLegionariesConfig } = await import('../src/config/legionaries.ts')
  const result = loadLegionariesConfig({ rootDir })

  assert.equal(result.agents.orchestrator.model, 'openai/gpt-5.5')
  assert.deepEqual(result.agents.orchestrator.reasoning, { effort: 'medium' })
  assert.equal(result.agents.explorer.model, 'opencode-go/deepseek-v4-flash')
  assert.equal(result.agents.librarian.model, 'opencode-go/minimax-m2.7')
  assert.equal(result.agents.builder.model, 'opencode-go/kimi-k2.6')
  assert.ok(!('dispatcher' in result.agents))
  assert.ok(!('frontend-developer' in result.agents))
  assert.ok(!('code-reviewer' in result.agents))
})

test('legionaries loader supports per-agent overrides via config override', async () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const tempConfigPath = path.join(tempDir, 'legionaries.loader-override.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

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
        builder: {
          model: 'github-copilot/gemini-3.1-pro-preview',
        },
      },
    }),
  )

  const { loadLegionariesConfig } = await import('../src/config/legionaries.ts')
  const result = loadLegionariesConfig({ rootDir, configPath: tempConfigPath })

  assert.equal(result.agents.orchestrator.model, 'github-copilot/claude-opus-4.1')
  assert.deepEqual(result.agents.orchestrator.reasoning, { effort: 'medium' })
  assert.equal(result.agents.builder.model, 'github-copilot/gemini-3.1-pro-preview')
})

test('legionaries loader accepts optional code-reviewer mapping when provided', async () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const tempConfigPath = path.join(tempDir, 'legionaries.optional-code-reviewer.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  fs.writeFileSync(
    tempConfigPath,
    YAML.stringify({
      agents: {
        ...original.agents,
        'code-reviewer': {
          model: 'openai/gpt-5.5',
          reasoning: {
            effort: 'high',
          },
        },
      },
    }),
  )

  const { loadLegionariesConfig } = await import('../src/config/legionaries.ts')
  const result = loadLegionariesConfig({ rootDir, configPath: tempConfigPath })

  assert.equal(result.agents['code-reviewer'].model, 'openai/gpt-5.5')
  assert.deepEqual(result.agents['code-reviewer'].reasoning, { effort: 'high' })
})

test('legionaries loader rejects missing agent model mappings', async () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const tempConfigPath = path.join(tempDir, 'legionaries.missing-model.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  delete original.agents.planner.model
  fs.writeFileSync(tempConfigPath, YAML.stringify(original))

  const { loadLegionariesConfig } = await import('../src/config/legionaries.ts')

  assert.throws(
    () => loadLegionariesConfig({ rootDir, configPath: tempConfigPath }),
    /missing model for agent: planner/,
  )
})

test('legionaries loader rejects invalid model formats', async () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const tempConfigPath = path.join(tempDir, 'legionaries.invalid-model.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  original.agents.planner.model = 'invalid-model-format'
  fs.writeFileSync(tempConfigPath, YAML.stringify(original))

  const { loadLegionariesConfig } = await import('../src/config/legionaries.ts')

  assert.throws(
    () => loadLegionariesConfig({ rootDir, configPath: tempConfigPath }),
    /invalid model format for planner: invalid-model-format/,
  )
})

test('legionaries loader rejects invalid reasoning effort values', async () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const tempConfigPath = path.join(tempDir, 'legionaries.invalid-reasoning.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  original.agents.orchestrator.reasoning.effort = 'extreme'
  fs.writeFileSync(tempConfigPath, YAML.stringify(original))

  const { loadLegionariesConfig } = await import('../src/config/legionaries.ts')

  assert.throws(
    () => loadLegionariesConfig({ rootDir, configPath: tempConfigPath }),
    /invalid reasoning effort for orchestrator: extreme/,
  )
})

test('legionaries loader accepts xhigh and max reasoning effort values', async () => {
  fs.mkdirSync(tempDir, { recursive: true })
  const tempConfigPath = path.join(tempDir, 'legionaries.reasoning-variants.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  original.agents.orchestrator.reasoning.effort = 'xhigh'
  original.agents.planner = {
    model: 'openai/gpt-5.4',
    reasoning: {
      effort: 'max',
    },
  }

  fs.writeFileSync(tempConfigPath, YAML.stringify(original))

  const { loadLegionariesConfig } = await import('../src/config/legionaries.ts')
  const result = loadLegionariesConfig({ rootDir, configPath: tempConfigPath })

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
