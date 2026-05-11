export const DEFAULT_AGENT = 'orchestrator' as const

export const REQUIRED_AGENT_NAMES = [
  'orchestrator',
  'explorer',
  'planner',
  'builder',
  'librarian',
] as const

export const OPTIONAL_AGENT_NAMES = ['code-reviewer'] as const

export const AGENT_NAMES = [
  ...REQUIRED_AGENT_NAMES,
  ...OPTIONAL_AGENT_NAMES,
] as const

export type RequiredAgentName = (typeof REQUIRED_AGENT_NAMES)[number]
export type OptionalAgentName = (typeof OPTIONAL_AGENT_NAMES)[number]
export type AgentName = (typeof AGENT_NAMES)[number]

export type AgentMode = 'primary' | 'subagent' | 'all'

export type PermissionConfig = Record<string, unknown>

export type BaseAgentDefinition = {
  description: string
  mode: AgentMode
  permission: PermissionConfig
  prompt: string
}

/**
 * Agent factory function with static mode property.
 * Allows per-model customization (prompt variants, provider-specific settings).
 */
export type AgentFactory = ((model: string) => BaseAgentDefinition) & {
  mode: AgentMode
}

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AgentReasoningConfig = {
  effort: ReasoningEffort
}

export type LegionaryEntry =
  | string
  | {
      model: string
      reasoning?: AgentReasoningConfig
    }

export type LegionariesConfig = {
  agents: Partial<Record<AgentName, LegionaryEntry>>
}

export type ResolvedLegionaryEntry = {
  model: string
  reasoning?: AgentReasoningConfig
}

export type ResolvedLegionariesMap = Record<
  RequiredAgentName,
  ResolvedLegionaryEntry
> & Partial<Record<OptionalAgentName, ResolvedLegionaryEntry>>

export type EffectiveAgentDefinition = BaseAgentDefinition & {
  model: string
  options?: {
    reasoning?: AgentReasoningConfig
  }
}

export type EffectiveAgentMap = Record<
  RequiredAgentName,
  EffectiveAgentDefinition
> & Partial<Record<OptionalAgentName, EffectiveAgentDefinition>>

export type EffectiveAgentConfig = {
  default_agent: typeof DEFAULT_AGENT
  agent: EffectiveAgentMap
}
