import assert from 'node:assert/strict'
import test from 'node:test'

test('plugin injects dio and dio-stop commands into OpenCode config', async () => {
  const pluginModule = await import('../src/index.ts')
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

  const config = {}
  await hooks.config(config)

  assert.match(config.command.dio.description, /devotio/i)
  assert.match(config.command.dio.template, /\$ARGUMENTS/)
  assert.match(config.command.dio.template, /<dio_complete>/)
  assert.match(config.command['dio-stop'].description, /cancel/i)
})

test('dio loop starts from command execution and continues on session idle', async () => {
  const prompts = []
  const toasts = []
  const { createDioLoopHooks } = await import('../src/runtime/dio-loop.ts')
  const hooks = createDioLoopHooks({
    maxIterations: 3,
    client: {
      session: {
        async messages() {
          return { data: [] }
        },
        async prompt(input) {
          prompts.push(input)
          return { data: true }
        },
      },
      tui: {
        async showToast(input) {
          toasts.push(input)
          return { data: true }
        },
      },
    },
  })

  await hooks['command.executed']({
    name: 'dio',
    sessionID: 'session-1',
    arguments: 'ship custom agents',
  })
  assert.equal(hooks.getState('session-1').objective, 'ship custom agents')

  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'session-1' } } })

  assert.equal(prompts.length, 1)
  assert.equal(prompts[0].path.id, 'session-1')
  assert.match(prompts[0].body.parts[0].text, /ship custom agents/)
  assert.match(prompts[0].body.parts[0].text, /<dio_complete>/)
  assert.deepEqual(toasts, [])
})

test('dio loop stops when session messages include the completion marker', async () => {
  const prompts = []
  const toasts = []
  const { createDioLoopHooks } = await import('../src/runtime/dio-loop.ts')
  const hooks = createDioLoopHooks({
    client: {
      session: {
        async messages() {
          return {
            data: [
              {
                info: {
                  role: 'assistant',
                },
                parts: [
                  {
                    type: 'text',
                    text: '<dio_complete>verified and done</dio_complete>',
                  },
                ],
              },
            ],
          }
        },
        async prompt(input) {
          prompts.push(input)
          return { data: true }
        },
      },
      tui: {
        async showToast(input) {
          toasts.push(input)
          return { data: true }
        },
      },
    },
  })

  await hooks['command.executed']({
    name: 'dio',
    sessionID: 'session-2',
    arguments: 'finish docs',
  })
  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'session-2' } } })

  assert.equal(prompts.length, 0)
  assert.equal(hooks.getState('session-2'), undefined)
  assert.equal(toasts[0].body.variant, 'success')
})

test('dio loop ignores completion marker text from user messages', async () => {
  const prompts = []
  const { createDioLoopHooks } = await import('../src/runtime/dio-loop.ts')
  const hooks = createDioLoopHooks({
    client: {
      session: {
        async messages() {
          return {
            data: [
              {
                info: {
                  role: 'user',
                },
                parts: [
                  {
                    type: 'text',
                    text: 'Use <dio_complete>only when complete</dio_complete> later',
                  },
                ],
              },
            ],
          }
        },
        async prompt(input) {
          prompts.push(input)
          return { data: true }
        },
      },
      tui: {
        async showToast() {
          return { data: true }
        },
      },
    },
  })

  await hooks['command.executed']({
    name: 'dio',
    sessionID: 'session-user-marker',
    arguments: 'finish safely',
  })
  await hooks.event({
    event: { type: 'session.idle', properties: { sessionID: 'session-user-marker' } },
  })

  assert.equal(prompts.length, 1)
  assert.equal(hooks.getState('session-user-marker').iteration, 1)
})

test('dio-stop cancels an active dio loop', async () => {
  const toasts = []
  const { createDioLoopHooks } = await import('../src/runtime/dio-loop.ts')
  const hooks = createDioLoopHooks({
    client: {
      session: {
        async messages() {
          return { data: [] }
        },
        async prompt() {
          throw new Error('should not continue after cancellation')
        },
      },
      tui: {
        async showToast(input) {
          toasts.push(input)
          return { data: true }
        },
      },
    },
  })

  await hooks['command.executed']({
    name: 'dio',
    sessionID: 'session-3',
    arguments: 'finish feature',
  })
  await hooks['command.executed']({
    name: 'dio-stop',
    sessionID: 'session-3',
    arguments: '',
  })
  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'session-3' } } })

  assert.equal(hooks.getState('session-3'), undefined)
  assert.equal(toasts[0].body.variant, 'warning')
})

test('dio loop stops at the max iteration guard', async () => {
  const prompts = []
  const toasts = []
  const { createDioLoopHooks } = await import('../src/runtime/dio-loop.ts')
  const hooks = createDioLoopHooks({
    maxIterations: 1,
    client: {
      session: {
        async messages() {
          return { data: [] }
        },
        async prompt(input) {
          prompts.push(input)
          return { data: true }
        },
      },
      tui: {
        async showToast(input) {
          toasts.push(input)
          return { data: true }
        },
      },
    },
  })

  await hooks['command.executed']({
    name: 'dio',
    sessionID: 'session-4',
    arguments: 'bounded work',
  })
  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'session-4' } } })
  await hooks.event({ event: { type: 'session.idle', properties: { sessionID: 'session-4' } } })

  assert.equal(prompts.length, 1)
  assert.equal(hooks.getState('session-4'), undefined)
  assert.equal(toasts[0].body.variant, 'warning')
  assert.match(toasts[0].body.message, /iteration limit/i)
})
