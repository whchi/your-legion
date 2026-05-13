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

function systemAgentsFrom(config) {
  return config.system_agents ?? config.agents
}

function makeTempDir(t, name) {
  fs.mkdirSync(tempDir, { recursive: true })
  const dir = fs.mkdtempSync(path.join(tempDir, `${name}-`))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function writeCustomAgent(dir, name, description) {
  const agentsDir = path.join(dir, 'your-legion', 'agents')
  fs.mkdirSync(agentsDir, { recursive: true })
  fs.writeFileSync(
    path.join(agentsDir, `${name}.ts`),
    `const MODE = 'subagent' as const

export default function createCustomAgent(_model: string) {
  return {
    description: ${JSON.stringify(description)},
    mode: MODE,
    permission: {
      read: 'allow',
      edit: 'deny',
      bash: 'deny',
      task: 'deny',
    },
    prompt: '# ${name}\\n\\nCustom runtime agent',
  }
}
createCustomAgent.mode = MODE
`,
  )
}

function writeNamedCustomAgent(dir, name, exportName, description) {
  const agentsDir = path.join(dir, 'your-legion', 'agents')
  fs.mkdirSync(agentsDir, { recursive: true })
  fs.writeFileSync(
    path.join(agentsDir, `${name}.ts`),
    `const MODE = 'subagent' as const

export function ${exportName}(_model: string) {
  return {
    description: ${JSON.stringify(description)},
    mode: MODE,
    permission: {
      read: 'allow',
      edit: 'deny',
      bash: 'deny',
      task: 'deny',
    },
    prompt: '# ${name}\\n\\nNamed export custom runtime agent',
  }
}
${exportName}.mode = MODE
`,
  )
}

test('custom agent provider discovers configured custom agents from OpenCode config paths', async (t) => {
  const projectDir = makeTempDir(t, 'custom-agent-project')
  const globalConfigDir = makeTempDir(t, 'custom-agent-global')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))
  const systemAgents = systemAgentsFrom(original)

  writeCustomAgent(globalConfigDir, 'scribe', 'Writes release notes and changelogs')
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
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir: projectDir,
    configDir: globalConfigDir,
    configPath,
  })

  assert.equal(result.agent.scribe.description, 'Writes release notes and changelogs')
  assert.equal(result.agent.scribe.model, 'openai/gpt-5.5')
  assert.deepEqual(result.agent.scribe.options.reasoning, { effort: 'low' })
  assert.equal(result.agent.scribe.mode, 'subagent')
  assert.equal(result.agent.orchestrator.permission.task.scribe, 'allow')
  assert.match(result.agent.orchestrator.prompt, /scribe/)
  assert.match(result.agent.orchestrator.prompt, /Writes release notes and changelogs/)
})

test('project custom agent definitions override global definitions', async (t) => {
  const projectDir = makeTempDir(t, 'custom-agent-precedence-project')
  const globalConfigDir = makeTempDir(t, 'custom-agent-precedence-global')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))
  const systemAgents = systemAgentsFrom(original)

  writeCustomAgent(globalConfigDir, 'scribe', 'Global scribe')
  writeCustomAgent(path.join(projectDir, '.opencode'), 'scribe', 'Project scribe')
  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgents,
      custom_agents: {
        scribe: 'openai/gpt-5.5',
      },
    }),
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir: projectDir,
    configDir: globalConfigDir,
    configPath,
  })

  assert.equal(result.agent.scribe.description, 'Project scribe')
})

test('custom agent provider accepts createPascalNameAgent named exports', async (t) => {
  const projectDir = makeTempDir(t, 'custom-agent-named-export-project')
  const globalConfigDir = makeTempDir(t, 'custom-agent-named-export-global')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))
  const systemAgents = systemAgentsFrom(original)

  writeNamedCustomAgent(
    path.join(projectDir, '.opencode'),
    'release-scribe',
    'createReleaseScribeAgent',
    'Named release scribe',
  )
  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgents,
      custom_agents: {
        'release-scribe': 'openai/gpt-5.5',
      },
    }),
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir: projectDir,
    configDir: globalConfigDir,
    configPath,
  })

  assert.equal(result.agent['release-scribe'].description, 'Named release scribe')
})

test('custom agent provider rejects attempts to replace system agents', async (t) => {
  const projectDir = makeTempDir(t, 'custom-agent-system-collision')
  const globalConfigDir = makeTempDir(t, 'custom-agent-system-collision-global')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))
  const systemAgents = systemAgentsFrom(original)

  writeCustomAgent(path.join(projectDir, '.opencode'), 'builder', 'Replacement builder')
  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgents,
      custom_agents: {
        builder: 'openai/gpt-5.5',
      },
    }),
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')

  await assert.rejects(
    () => buildEffectiveAgentConfig({
      rootDir: projectDir,
      configDir: globalConfigDir,
      configPath,
    }),
    /custom agent cannot replace system agent: builder/,
  )
})

test('configured custom agents must have a discovered definition file', async (t) => {
  const projectDir = makeTempDir(t, 'custom-agent-missing-definition')
  const globalConfigDir = makeTempDir(t, 'custom-agent-missing-definition-global')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))
  const systemAgents = systemAgentsFrom(original)

  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgents,
      custom_agents: {
        scribe: 'openai/gpt-5.5',
      },
    }),
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')

  await assert.rejects(
    () => buildEffectiveAgentConfig({
      rootDir: projectDir,
      configDir: globalConfigDir,
      configPath,
    }),
    /missing custom agent definition for configured agent: scribe/,
  )
})
