import { fileURLToPath } from 'node:url';

import { loadLegionariesConfig, type LoadLegionariesConfigOptions } from '../config/legionaries';
import {
  DEFAULT_AGENT,
  REQUIRED_AGENT_NAMES,
  type BaseAgentDefinition,
  type EffectiveAgentConfig,
  type EffectiveAgentDefinition,
  type ResolvedLegionaryEntry,
} from '../shared/agent-types';
import { loadAgentDefinitionProviders } from './agent-definition-provider';
import { buildDomainPromptSection, resolveDomainPacks } from './domain-packs';

function toPath(value: string | URL) {
  return value instanceof URL ? fileURLToPath(value) : value;
}

function applyReasoning(
  definition: BaseAgentDefinition,
  configuredAgent: ResolvedLegionaryEntry,
): EffectiveAgentDefinition {
  return {
    ...definition,
    model: configuredAgent.model,
    ...(configuredAgent.reasoning
      ? {
          options: {
            reasoning: configuredAgent.reasoning,
          },
        }
      : {}),
  };
}

function augmentOrchestratorForCustomAgents(
  orchestrator: EffectiveAgentDefinition,
  customAgents: EffectiveAgentConfig['agent'],
): EffectiveAgentDefinition {
  const customEntries = Object.entries(customAgents);
  if (customEntries.length === 0) {
    return orchestrator;
  }

  const taskPermission =
    typeof orchestrator.permission.task === 'object' && orchestrator.permission.task
      ? ({ ...orchestrator.permission.task } as Record<string, unknown>)
      : {};

  const promptLines = customEntries.map(([name, agent]) => `- \`${name}\` (${agent.mode}): ${agent.description}`);

  for (const [name, agent] of customEntries) {
    if (agent.mode !== 'primary') {
      taskPermission[name] = 'allow';
    }
  }

  return {
    ...orchestrator,
    permission: {
      ...orchestrator.permission,
      task: taskPermission,
    },
    prompt: `${orchestrator.prompt}

## Custom Agents

The following bundled or worktree-discovered custom agents are available when they fit the user's explicit request or the dominant intent:

${promptLines.join('\n')}`,
  };
}

function augmentAgentsWithDomainPacks(agents: EffectiveAgentConfig['agent'], domainSection: string) {
  if (!domainSection) {
    return agents;
  }

  return Object.fromEntries(
    Object.entries(agents).map(([agentName, agent]) => [
      agentName,
      {
        ...agent,
        prompt: `${agent.prompt}

${domainSection}`,
      },
    ]),
  ) as EffectiveAgentConfig['agent'];
}

function allowDomainCatalogExternalReads(agents: EffectiveAgentConfig['agent']) {
  return Object.fromEntries(
    Object.entries(agents).map(([agentName, agent]) => {
      if (agentName === DEFAULT_AGENT || agent.permission.read !== 'allow') {
        return [agentName, agent];
      }

      return [
        agentName,
        {
          ...agent,
          permission: {
            ...agent.permission,
            external_directory: 'allow',
          },
        },
      ];
    }),
  ) as EffectiveAgentConfig['agent'];
}

export async function buildEffectiveAgentConfig(options: LoadLegionariesConfigOptions): Promise<EffectiveAgentConfig> {
  const {
    systemAgents: configuredSystemAgents,
    customAgents: configuredCustomAgents,
    domains: configuredDomains,
    filePath: configPath,
  } = loadLegionariesConfig(options);
  const providers = await loadAgentDefinitionProviders(options);
  let agent = {} as EffectiveAgentConfig['agent'];
  const customAgentDefinitions = {} as EffectiveAgentConfig['agent'];

  for (const agentName of REQUIRED_AGENT_NAMES) {
    const configuredAgent = configuredSystemAgents[agentName];
    if (!configuredAgent) {
      continue;
    }

    const factory = providers.system[agentName];
    const baseDefinition = factory(configuredAgent.model);

    agent[agentName] = applyReasoning(baseDefinition, configuredAgent);
  }

  for (const [agentName, configuredAgent] of Object.entries(configuredCustomAgents)) {
    const factory = providers.custom[agentName];

    if (!factory) {
      throw new Error(`missing custom agent definition for configured agent: ${agentName}`);
    }

    const baseDefinition = factory(configuredAgent.model);
    const effectiveDefinition = applyReasoning(baseDefinition, configuredAgent);
    agent[agentName] = effectiveDefinition;
    customAgentDefinitions[agentName] = effectiveDefinition;
  }

  if (agent.orchestrator) {
    agent.orchestrator = augmentOrchestratorForCustomAgents(agent.orchestrator, customAgentDefinitions);
  }

  const domainPacks = resolveDomainPacks({
    configDir: options.configDir ? toPath(options.configDir) : undefined,
    configPath,
    domains: configuredDomains,
  });
  const domainSection = buildDomainPromptSection(domainPacks);
  agent = augmentAgentsWithDomainPacks(agent, domainSection);
  if (domainSection) {
    agent = allowDomainCatalogExternalReads(agent);
  }

  return {
    default_agent: DEFAULT_AGENT,
    agent,
  };
}
