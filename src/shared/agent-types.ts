export const DEFAULT_AGENT = 'orchestrator' as const

export const REQUIRED_AGENT_NAMES = [
  'orchestrator',
  'explorer',
  'planner',
  'builder',
  'librarian',
] as const

export const OPTIONAL_AGENT_NAMES = [] as const

export const AGENT_NAMES = [
  ...REQUIRED_AGENT_NAMES,
  ...OPTIONAL_AGENT_NAMES,
] as const

export type RequiredAgentName = (typeof REQUIRED_AGENT_NAMES)[number]
export type OptionalAgentName = (typeof OPTIONAL_AGENT_NAMES)[number]
export type SystemAgentName = (typeof AGENT_NAMES)[number]
export type AgentName = SystemAgentName
export type CustomAgentName = string
export type RuntimeAgentName = SystemAgentName | CustomAgentName

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

export type LoadableAgentFactory = (model: string) => BaseAgentDefinition

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

export type DomainComponentOverride =
  | false
  | {
      path: string
    }

export type DomainComponentOverrides = Record<string, DomainComponentOverride>

export type DomainConfig =
  | true
  | {
      workflows?: DomainComponentOverrides
      decisions?: DomainComponentOverrides
      examples?: DomainComponentOverrides
      skills?: DomainComponentOverrides
    }

export type LegionariesConfig = {
  agents?: Partial<Record<SystemAgentName, LegionaryEntry>>
  system_agents?: Partial<Record<SystemAgentName, LegionaryEntry>>
  custom_agents?: Record<CustomAgentName, LegionaryEntry>
  domains?: Record<string, DomainConfig>
}

export type ResolvedLegionaryEntry = {
  model: string
  reasoning?: AgentReasoningConfig
}

export type ResolvedLegionariesMap = Record<
  RequiredAgentName,
  ResolvedLegionaryEntry
> & Partial<Record<OptionalAgentName, ResolvedLegionaryEntry>>

export type ResolvedCustomLegionariesMap = Record<
  CustomAgentName,
  ResolvedLegionaryEntry
>

export type ResolvedDomainConfigMap = Record<string, DomainConfig>

export type EffectiveAgentDefinition = BaseAgentDefinition & {
  model: string
  options?: {
    reasoning?: AgentReasoningConfig
  }
}

export type EffectiveAgentMap = Record<
  RequiredAgentName,
  EffectiveAgentDefinition
> & Partial<Record<OptionalAgentName, EffectiveAgentDefinition>> &
  Record<string, EffectiveAgentDefinition>

export type CommandDefinition = {
  template: string
  description: string
  agent?: string
  model?: string
  subtask?: boolean
}

export type EffectiveAgentConfig = {
  default_agent: typeof DEFAULT_AGENT
  agent: EffectiveAgentMap
  command: Record<string, CommandDefinition>
}
