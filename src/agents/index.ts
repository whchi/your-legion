import type { AgentName, AgentFactory, BaseAgentDefinition } from '../shared/agent-types';
import { createExplorerAgent } from './explorer';
import { createBuilderAgent } from './builder';
import { createLibrarianAgent } from './librarian';
import { createOrchestratorAgent } from './orchestrator';
import { createPlannerAgent } from './planner';

export const AGENT_FACTORIES: Record<AgentName, AgentFactory> = {
  orchestrator: createOrchestratorAgent,
  explorer: createExplorerAgent,
  librarian: createLibrarianAgent,
  planner: createPlannerAgent,
  builder: createBuilderAgent,
};

export function buildAgentDefinition(name: AgentName, model: string): BaseAgentDefinition {
  return AGENT_FACTORIES[name](model);
}

/** Backward-compatible static definitions (built with an empty model string). */
export const BASE_AGENT_DEFINITIONS: Record<AgentName, BaseAgentDefinition> = Object.fromEntries(
  Object.entries(AGENT_FACTORIES).map(([k, f]) => [k, f('')]),
) as Record<AgentName, BaseAgentDefinition>;
