import { AGENT_FACTORIES } from '../agents/index.ts'
import { loadLegionariesConfig, type LoadLegionariesConfigOptions } from '../config/legionaries.ts'
import { DEFAULT_AGENT, type AgentName, type EffectiveAgentConfig } from '../shared/agent-types.ts'

export function buildEffectiveAgentConfig(
  options: LoadLegionariesConfigOptions,
): EffectiveAgentConfig {
  const { agents: configuredAgents } = loadLegionariesConfig(options)
  const agent = {} as EffectiveAgentConfig['agent']

  for (const agentName of Object.keys(configuredAgents) as AgentName[]) {
    const configuredAgent = configuredAgents[agentName]
    if (!configuredAgent) {
      continue
    }

    const baseDefinition = AGENT_FACTORIES[agentName](configuredAgent.model)

    agent[agentName] = {
      ...baseDefinition,
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
