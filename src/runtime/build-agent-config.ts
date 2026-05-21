import { fileURLToPath } from 'node:url';

import { loadLegionariesConfig, type LoadLegionariesConfigOptions } from '../config/legionaries';
import {
  DEFAULT_AGENT,
  REQUIRED_AGENT_NAMES,
  type BaseAgentDefinition,
  type CommandDefinition,
  type EffectiveAgentConfig,
  type EffectiveAgentDefinition,
  type ResolvedLegionaryEntry,
} from '../shared/agent-types';
import { loadAgentDefinitionProviders } from './agent-definition-provider';
import { buildDomainPromptSection, resolveDomainPacks } from './domain-packs';

function toPath(value: string | URL) {
  return value instanceof URL ? fileURLToPath(value) : value;
}

const DIO_COMMAND_TEMPLATE = `DIO means devotio: a deliberate vow to carry the requested work through to completion.

You are entering DIO mode for:

$ARGUMENTS

Work with disciplined persistence:
- clarify only when correctness or data safety truly requires it
- inspect the repository before changing behavior
- keep going until the requested outcome is implemented and verified
- use the smallest correct changes that satisfy the goal
- report real verification results

When and only when the work is genuinely complete, include this exact completion marker in your final response:

<dio_complete>summarize what was completed and verified</dio_complete>`;

const DIO_STOP_COMMAND_TEMPLATE = `Cancel the active DIO loop for this session.

If no DIO loop is active, say that there is no active DIO loop to cancel.`;

export const DIO_COMMANDS: Record<string, CommandDefinition> = {
  dio: {
    description: 'Devotio completion loop: vow to keep working until done',
    template: DIO_COMMAND_TEMPLATE,
    agent: DEFAULT_AGENT,
    subtask: false,
  },
  'dio-stop': {
    description: 'Cancel the active DIO loop for this session',
    template: DIO_STOP_COMMAND_TEMPLATE,
    agent: DEFAULT_AGENT,
    subtask: false,
  },
};

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

The following project or global custom agents are available when they fit the user's explicit request or the dominant intent:

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
  agent = augmentAgentsWithDomainPacks(agent, buildDomainPromptSection(domainPacks));

  return {
    default_agent: DEFAULT_AGENT,
    agent,
    command: DIO_COMMANDS,
  };
}
