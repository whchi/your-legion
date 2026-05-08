import type { AgentName, BaseAgentDefinition } from '../shared/agent-types.ts'
import { codeReviewerAgent } from './code-reviewer.ts'
import { dispatcherAgent } from './dispatcher.ts'
import { explorerAgent } from './explorer.ts'
import { frontendDeveloperAgent } from './frontend-dev.ts'
import { builderAgent } from './implementer.ts'
import { librarianAgent } from './librarian.ts'
import { orchestratorAgent } from './orchestrator.ts'
import { plannerAgent } from './planner.ts'

export const BASE_AGENT_DEFINITIONS: Record<AgentName, BaseAgentDefinition> = {
  orchestrator: orchestratorAgent,
  dispatcher: dispatcherAgent,
  explorer: explorerAgent,
  librarian: librarianAgent,
  planner: plannerAgent,
  builder: builderAgent,
  'frontend-developer': frontendDeveloperAgent,
  'code-reviewer': codeReviewerAgent,
}
