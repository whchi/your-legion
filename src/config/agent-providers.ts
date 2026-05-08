import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { isAbsolute, join, resolve } from 'node:path'
import YAML from 'yaml'

import {
  AGENT_NAMES,
  type AgentName,
  type AgentProviderConfig,
  type AgentProviderEntry,
  type ResolvedAgentProviderEntry,
  type ReasoningEffort,
} from '../shared/agent-types.ts'

export const MODEL_PATTERN = /^[a-z0-9][a-z0-9-]*\/.+$/i
const REASONING_EFFORTS = new Set<ReasoningEffort>([
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
])

export type LoadAgentProviderConfigOptions = {
  rootDir: string | URL
  configPath?: string | URL
  configDir?: string | URL
}

function toPath(value: string | URL) {
  if (value instanceof URL) {
    return fileURLToPath(value)
  }

  return value
}

export function resolveAgentProviderConfigPath({
  rootDir,
  configPath,
  configDir,
}: LoadAgentProviderConfigOptions) {
  const rootPath = resolve(toPath(rootDir))

  if (configPath) {
    if (configPath instanceof URL) {
      return toPath(configPath)
    }

    return isAbsolute(configPath) ? configPath : resolve(rootPath, configPath)
  }

  if (process.env.AGENT_PROVIDER_CONFIG) {
    return resolve(process.env.AGENT_PROVIDER_CONFIG)
  }

  const projectConfigPath = join(rootPath, 'agent-providers.yaml')
  if (existsSync(projectConfigPath)) {
    return projectConfigPath
  }

  const configRoot = configDir ? resolve(toPath(configDir)) : getOpenCodeConfigDir()
  const globalConfigPath = join(configRoot, 'agent-providers.yaml')
  if (existsSync(globalConfigPath)) {
    return globalConfigPath
  }

  return projectConfigPath
}

export function getOpenCodeConfigDir(env: NodeJS.ProcessEnv = process.env) {
  return env.XDG_CONFIG_HOME ? join(env.XDG_CONFIG_HOME, 'opencode') : join(homedir(), '.config', 'opencode')
}

function normalizeAgentEntry(agent: AgentName, entry: AgentProviderEntry | undefined): ResolvedAgentProviderEntry {
  const resolved = typeof entry === 'string' ? { model: entry } : entry

  if (!resolved?.model) {
    throw new Error(`missing model for agent: ${agent}`)
  }

  if (!MODEL_PATTERN.test(resolved.model)) {
    throw new Error(`invalid model format for ${agent}: ${resolved.model}`)
  }

  if (resolved.reasoning && !REASONING_EFFORTS.has(resolved.reasoning.effort)) {
    throw new Error(`invalid reasoning effort for ${agent}: ${resolved.reasoning.effort}`)
  }

  return resolved
}

function validateModelMap(
  models: Partial<Record<AgentName, AgentProviderEntry>>,
): Record<AgentName, ResolvedAgentProviderEntry> {
  const resolvedModels = {} as Record<AgentName, ResolvedAgentProviderEntry>

  for (const agent of AGENT_NAMES) {
    resolvedModels[agent] = normalizeAgentEntry(agent, models[agent])
  }

  return resolvedModels
}

export function loadAgentProviderConfig(options: LoadAgentProviderConfigOptions) {
  const filePath = resolveAgentProviderConfigPath(options)
  const raw = readFileSync(filePath, 'utf8')
  const parsed = YAML.parse(raw) as AgentProviderConfig | null

  if (!parsed?.agents || typeof parsed.agents !== 'object') {
    throw new Error('agent-providers.yaml missing agents map')
  }

  const agents = validateModelMap(parsed.agents)

  return {
    filePath,
    agents,
  }
}
