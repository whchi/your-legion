import type { AgentName, AgentFactory, BaseAgentDefinition } from '../shared/agent-types.ts'
import { createCodeReviewerAgent } from './code-reviewer.ts'
import { createDispatcherAgent } from './dispatcher.ts'
import { createExplorerAgent } from './explorer.ts'
import { createFrontendDeveloperAgent } from './frontend-dev.ts'
import { createBuilderAgent } from './implementer.ts'
import { createLibrarianAgent } from './librarian.ts'
import { createOrchestratorAgent } from './orchestrator.ts'
import { createPlannerAgent } from './planner.ts'

export const AGENT_FACTORIES: Record<AgentName, AgentFactory> = {
  orchestrator: createOrchestratorAgent,
  dispatcher: createDispatcherAgent,
  explorer: createExplorerAgent,
  librarian: createLibrarianAgent,
  planner: createPlannerAgent,
  builder: createBuilderAgent,
  'frontend-developer': createFrontendDeveloperAgent,
  'code-reviewer': createCodeReviewerAgent,
}

export function buildAgentDefinition(
  name: AgentName,
  model: string,
): BaseAgentDefinition {
  return AGENT_FACTORIES[name](model)
}

/** Backward-compatible static definitions (built with an empty model string). */
export const BASE_AGENT_DEFINITIONS: Record<AgentName, BaseAgentDefinition> =
  Object.fromEntries(
    Object.entries(AGENT_FACTORIES).map(([k, f]) => [
      k,
      f(''),
    ]),
  ) as Record<AgentName, BaseAgentDefinition>
