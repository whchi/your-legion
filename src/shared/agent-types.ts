export const DEFAULT_AGENT = 'orchestrator' as const

export const AGENT_NAMES = [
  'orchestrator',
  'dispatcher',
  'explorer',
  'librarian',
  'planner',
  'builder',
  'frontend-developer',
  'code-reviewer',
] as const

export type AgentName = (typeof AGENT_NAMES)[number]

export type AgentMode = 'primary' | 'subagent' | 'all'

export type PermissionConfig = Record<string, unknown>

export type BaseAgentDefinition = {
  description: string
  mode: AgentMode
  permission: PermissionConfig
  prompt: string
}

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AgentReasoningConfig = {
  effort: ReasoningEffort
}

export type AgentProviderEntry =
  | string
  | {
      model: string
      reasoning?: AgentReasoningConfig
    }

export type AgentProviderConfig = {
  agents: Partial<Record<AgentName, AgentProviderEntry>>
}

export type ResolvedAgentProviderEntry = {
  model: string
  reasoning?: AgentReasoningConfig
}

export type EffectiveAgentConfig = {
  default_agent: typeof DEFAULT_AGENT
  agent: Record<
    AgentName,
    BaseAgentDefinition & {
      model: string
      options?: {
        reasoning?: AgentReasoningConfig
      }
    }
  >
}
