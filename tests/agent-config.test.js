import assert from 'node:assert/strict'
import test from 'node:test'

test('agent set includes exploration and docs research specialists', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const files = Object.keys(BASE_AGENT_DEFINITIONS).sort()

  assert.ok(files.includes('explorer'))
  assert.ok(files.includes('librarian'))
  assert.ok(files.includes('builder'))
  assert.ok(files.includes('frontend-developer'))
})

test('orchestrator prompt includes an intent gate and can delegate to explorer and librarian', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator

  assert.equal(orchestrator.mode, 'primary')
  assert.equal(orchestrator.permission.task.explorer, 'allow')
  assert.equal(orchestrator.permission.task.librarian, 'allow')
  assert.equal(orchestrator.permission.task.builder, 'allow')
  assert.equal(orchestrator.permission.task['frontend-developer'], 'allow')
  assert.match(orchestrator.prompt, /Intent Gate/i)
  assert.match(orchestrator.prompt, /explore/i)
  assert.match(orchestrator.prompt, /docs research|library docs|api references/i)
})

test('dispatcher prompt documents leaf agents and parallelization rules', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const dispatcher = BASE_AGENT_DEFINITIONS.dispatcher

  assert.equal(dispatcher.permission.task.explorer, 'allow')
  assert.equal(dispatcher.permission.task.librarian, 'allow')
  assert.equal(dispatcher.permission.task.builder, 'allow')
  assert.equal(dispatcher.permission.task['frontend-developer'], 'allow')
  assert.match(dispatcher.prompt, /leaf/i)
  assert.match(dispatcher.prompt, /parallel/i)
  assert.match(dispatcher.prompt, /explorer/i)
  assert.match(dispatcher.prompt, /librarian/i)
})

test('explorer is read-only and cannot delegate', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const explorer = BASE_AGENT_DEFINITIONS.explorer

  assert.equal(explorer.mode, 'subagent')
  assert.equal(explorer.permission.edit, 'deny')
  assert.equal(explorer.permission.write, 'deny')
  assert.equal(explorer.permission.bash, 'deny')
  assert.equal(explorer.permission.task, 'deny')
})

test('librarian is read-only and cannot delegate', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const librarian = BASE_AGENT_DEFINITIONS.librarian

  assert.equal(librarian.mode, 'subagent')
  assert.equal(librarian.permission.edit, 'deny')
  assert.equal(librarian.permission.write, 'deny')
  assert.equal(librarian.permission.task, 'deny')
  assert.match(librarian.prompt, /documentation|API|reference/i)
})

test('every agent factory exposes a static mode property', async () => {
  const { AGENT_FACTORIES } = await import('../src/agents/index.ts')

  for (const [name, factory] of Object.entries(AGENT_FACTORIES)) {
    assert.ok(
      ['primary', 'subagent', 'all'].includes(factory.mode),
      `${name} factory.mode should be a valid AgentMode`,
    )
  }
})

test('buildAgentDefinition produces valid config from factory', async () => {
  const { buildAgentDefinition } = await import('../src/agents/index.ts')

  const orchestrator = buildAgentDefinition('orchestrator', 'openai/gpt-5.5')
  assert.equal(orchestrator.mode, 'primary')
  assert.equal(orchestrator.permission.bash, 'deny')
  assert.match(orchestrator.prompt, /Orchestrator/)

  const builder = buildAgentDefinition('builder', 'opencode-go/kimi-k2.6')
  assert.equal(builder.mode, 'subagent')
  assert.equal(builder.permission.edit, 'allow')
  assert.match(builder.prompt, /Builder/)
})
