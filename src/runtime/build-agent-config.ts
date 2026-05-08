import { BASE_AGENT_DEFINITIONS } from '../agents/index.ts'
import { loadAgentProviderConfig, type LoadAgentProviderConfigOptions } from '../config/agent-providers.ts'
import { AGENT_NAMES, DEFAULT_AGENT, type EffectiveAgentConfig } from '../shared/agent-types.ts'

export function buildEffectiveAgentConfig(
  options: LoadAgentProviderConfigOptions,
): EffectiveAgentConfig {
  const { agents: configuredAgents } = loadAgentProviderConfig(options)
  const agent = {} as EffectiveAgentConfig['agent']

  for (const agentName of AGENT_NAMES) {
    const configuredAgent = configuredAgents[agentName]

    agent[agentName] = {
      ...BASE_AGENT_DEFINITIONS[agentName],
      model: configuredAgent.model,
      ...(configuredAgent.reasoning
        ? {
            options: {
              reasoning: configuredAgent.reasoning,
            },
          }
        : {}),
    }
  }

  return {
    default_agent: DEFAULT_AGENT,
    agent,
  }
}
