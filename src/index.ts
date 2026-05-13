import { buildEffectiveAgentConfig } from './runtime/build-agent-config.ts'
import { createDioLoopHooks } from './runtime/dio-loop.ts'

type YourLegionPluginOptions = {
  configPath?: string
  dio?: {
    maxIterations?: number
  }
}

const yourLegionPlugin = {
  id: 'your-legion',
  async server(input: { worktree: string }, options: YourLegionPluginOptions = {}) {
    const { getState: _getDioState, ...dioHooks } = createDioLoopHooks({
      client: (input as { client?: unknown }).client ?? {},
      maxIterations: options.dio?.maxIterations,
    })

    return {
      async config(config: {
        default_agent?: string
        agent?: Record<string, unknown>
        command?: Record<string, unknown>
      }) {
        const effectiveConfig = await buildEffectiveAgentConfig({
          rootDir: input.worktree,
          configPath: options.configPath,
        })

        config.default_agent = effectiveConfig.default_agent
        config.agent = {
          ...(config.agent ?? {}),
          ...effectiveConfig.agent,
        }
        config.command = {
          ...(config.command ?? {}),
          ...effectiveConfig.command,
        }
      },
      ...dioHooks,
    }
  },
}

export default yourLegionPlugin
export { buildEffectiveAgentConfig } from './runtime/build-agent-config.ts'
