import assert from 'node:assert/strict'
import test from 'node:test'

const FORBIDDEN_PROMPT_HOOKS = [
  'better-test-driven-development',
  'testing-strategy',
  'debugging-playbook',
  'debug-triage',
  'build-fix',
  'project-structure-advisor',
  'repository-boundary-review',
  'ddd-fit-check',
  'maintainable-code-review',
]

test('agent registry supports five required specialists and optional code review', async () => {
  const { REQUIRED_AGENT_NAMES, OPTIONAL_AGENT_NAMES } = await import('../src/shared/agent-types.ts')
  const { AGENT_FACTORIES, BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')

  assert.deepEqual(REQUIRED_AGENT_NAMES, [
    'orchestrator',
    'explorer',
    'planner',
    'builder',
    'librarian',
  ])
  assert.deepEqual(OPTIONAL_AGENT_NAMES, ['code-reviewer'])
  assert.ok(!('dispatcher' in AGENT_FACTORIES))
  assert.ok(!('frontend-developer' in AGENT_FACTORIES))
  assert.ok('code-reviewer' in AGENT_FACTORIES)
  assert.ok(!('dispatcher' in BASE_AGENT_DEFINITIONS))
  assert.ok(!('frontend-developer' in BASE_AGENT_DEFINITIONS))
  assert.ok('code-reviewer' in BASE_AGENT_DEFINITIONS)
})

test('orchestrator prompt includes an intent gate and can delegate to explorer and librarian', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const orchestrator = BASE_AGENT_DEFINITIONS.orchestrator

  assert.equal(orchestrator.mode, 'primary')
  assert.equal(orchestrator.permission.task.explorer, 'allow')
  assert.equal(orchestrator.permission.task.librarian, 'allow')
  assert.equal(orchestrator.permission.task.builder, 'allow')
  assert.ok(!('dispatcher' in orchestrator.permission.task))
  assert.ok(!('frontend-developer' in orchestrator.permission.task))
  assert.ok(!('code-reviewer' in orchestrator.permission.task))
  assert.match(orchestrator.prompt, /Intent Gate/i)
  assert.match(orchestrator.prompt, /explore/i)
  assert.match(orchestrator.prompt, /docs research|library docs|api references/i)
  assert.doesNotMatch(orchestrator.prompt, /dispatcher/i)
  assert.doesNotMatch(orchestrator.prompt, /frontend-developer/i)
  assert.doesNotMatch(orchestrator.prompt, /code-reviewer/i)
})

test('leaf specialists cannot delegate to other subagents', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')

  assert.equal(BASE_AGENT_DEFINITIONS.builder.permission.task, 'deny')
  assert.equal(BASE_AGENT_DEFINITIONS.explorer.permission.task, 'deny')
  assert.equal(BASE_AGENT_DEFINITIONS.librarian.permission.task, 'deny')
  assert.equal(BASE_AGENT_DEFINITIONS['code-reviewer'].permission.task, 'deny')
})

test('planner is docs-only and cannot modify application code paths', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const planner = BASE_AGENT_DEFINITIONS.planner

  assert.equal(planner.mode, 'subagent')
  assert.deepEqual(planner.permission.edit, {
    '*': 'deny',
    'docs/**/*.md': 'allow',
  })
  assert.match(planner.prompt, /docs\/\*\*\/\*\.md/i)
  assert.doesNotMatch(planner.prompt, /write markdown planning documents only by convention/i)
})

test('builder prompt carries debugging, testing, and verification workflow cues', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const builder = BASE_AGENT_DEFINITIONS.builder

  assert.match(builder.prompt, /frontend|UI|accessibility/i)
  assert.match(builder.prompt, /failing test/i)
  assert.match(builder.prompt, /narrowest test level/i)
  assert.match(builder.prompt, /environment, data, and logic/i)
  assert.match(builder.prompt, /one build or type error at a time/i)
})

test('optional code reviewer prompt carries findings-first review workflow cues', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const codeReviewer = BASE_AGENT_DEFINITIONS['code-reviewer']

  assert.equal(codeReviewer.mode, 'subagent')
  assert.equal(codeReviewer.permission.edit, 'deny')
  assert.match(codeReviewer.prompt, /Findings/i)
  assert.match(codeReviewer.prompt, /severity/i)
  assert.match(codeReviewer.prompt, /change intent/i)
  assert.match(codeReviewer.prompt, /return contracts/i)
  assert.match(codeReviewer.prompt, /abstraction level/i)
})

test('planner prompt carries structure and boundary review workflow cues', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const planner = BASE_AGENT_DEFINITIONS.planner

  assert.match(planner.prompt, /project scale and ownership/i)
  assert.match(planner.prompt, /persistence access/i)
  assert.match(planner.prompt, /DDD fit/i)
})

test('agent prompts inline workflows instead of hardcoding skill hooks', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')

  for (const [agentName, definition] of Object.entries(BASE_AGENT_DEFINITIONS)) {
    for (const hook of FORBIDDEN_PROMPT_HOOKS) {
      assert.doesNotMatch(
        definition.prompt,
        new RegExp(hook, 'i'),
        `${agentName} prompt should inline ${hook} workflow instead of naming the hook`,
      )
    }
  }
})

test('explorer is read-only and cannot delegate', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const explorer = BASE_AGENT_DEFINITIONS.explorer

  assert.equal(explorer.mode, 'subagent')
  assert.equal(explorer.permission.edit, 'deny')
  assert.ok(!('write' in explorer.permission))
  assert.equal(explorer.permission.bash, 'deny')
  assert.equal(explorer.permission.task, 'deny')
})

test('librarian is read-only and cannot delegate', async () => {
  const { BASE_AGENT_DEFINITIONS } = await import('../src/agents/index.ts')
  const librarian = BASE_AGENT_DEFINITIONS.librarian

  assert.equal(librarian.mode, 'subagent')
  assert.equal(librarian.permission.edit, 'deny')
  assert.ok(!('write' in librarian.permission))
  assert.equal(librarian.permission.task, 'deny')
  assert.equal(librarian.permission['context7_resolve-library-id'], 'allow')
  assert.equal(librarian.permission['context7_query-docs'], 'allow')
  assert.match(librarian.prompt, /Context7/i)
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

  const planner = buildAgentDefinition('planner', 'openai/gpt-5.5')
  assert.deepEqual(planner.permission.edit, {
    '*': 'deny',
    'docs/**/*.md': 'allow',
  })

  const codeReviewer = buildAgentDefinition('code-reviewer', 'openai/gpt-5.5')
  assert.equal(codeReviewer.mode, 'subagent')
  assert.equal(codeReviewer.permission.edit, 'deny')
  assert.match(codeReviewer.prompt, /Code Reviewer/)
})
