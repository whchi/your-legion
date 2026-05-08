import { buildEffectiveAgentConfig } from './runtime/build-agent-config.ts'

type YourLegionPluginOptions = {
  configPath?: string
}

const yourLegionPlugin = {
  id: 'your-legion',
  async server(input: { worktree: string }, options: YourLegionPluginOptions = {}) {
    return {
      async config(config: {
        default_agent?: string
        agent?: Record<string, unknown>
      }) {
        const effectiveConfig = buildEffectiveAgentConfig({
          rootDir: input.worktree,
          configPath: options.configPath,
        })

        config.default_agent = effectiveConfig.default_agent
        config.agent = {
          ...(config.agent ?? {}),
          ...effectiveConfig.agent,
        }
      },
    }
  },
}

export default yourLegionPlugin
export { buildEffectiveAgentConfig } from './runtime/build-agent-config.ts'
