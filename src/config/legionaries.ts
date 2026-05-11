import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { isAbsolute, join, resolve } from 'node:path'
import YAML from 'yaml'

import {
  OPTIONAL_AGENT_NAMES,
  REQUIRED_AGENT_NAMES,
  type AgentName,
  type LegionariesConfig,
  type LegionaryEntry,
  type ResolvedLegionaryEntry,
  type ResolvedLegionariesMap,
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

export type LoadLegionariesConfigOptions = {
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

export function resolveLegionariesConfigPath({
  rootDir,
  configPath,
  configDir,
}: LoadLegionariesConfigOptions) {
  const rootPath = resolve(toPath(rootDir))

  if (configPath) {
    if (configPath instanceof URL) {
      return toPath(configPath)
    }

    return isAbsolute(configPath) ? configPath : resolve(rootPath, configPath)
  }

  if (process.env.LEGIONARIES_CONFIG) {
    return resolve(process.env.LEGIONARIES_CONFIG)
  }

  const projectConfigPath = join(rootPath, 'legionaries.yaml')
  if (existsSync(projectConfigPath)) {
    return projectConfigPath
  }

  const configRoot = configDir ? resolve(toPath(configDir)) : getOpenCodeConfigDir()
  const globalConfigPath = join(configRoot, 'legionaries.yaml')
  if (existsSync(globalConfigPath)) {
    return globalConfigPath
  }

  return projectConfigPath
}

export function getOpenCodeConfigDir(env: NodeJS.ProcessEnv = process.env) {
  return env.XDG_CONFIG_HOME ? join(env.XDG_CONFIG_HOME, 'opencode') : join(homedir(), '.config', 'opencode')
}

function normalizeAgentEntry(agent: AgentName, entry: LegionaryEntry | undefined): ResolvedLegionaryEntry {
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
  models: Partial<Record<AgentName, LegionaryEntry>>,
): ResolvedLegionariesMap {
  const resolvedModels = {} as ResolvedLegionariesMap

  for (const agent of REQUIRED_AGENT_NAMES) {
    resolvedModels[agent] = normalizeAgentEntry(agent, models[agent])
  }

  for (const agent of OPTIONAL_AGENT_NAMES) {
    if (models[agent] !== undefined) {
      resolvedModels[agent] = normalizeAgentEntry(agent, models[agent])
    }
  }

  return resolvedModels
}

export function loadLegionariesConfig(options: LoadLegionariesConfigOptions) {
  const filePath = resolveLegionariesConfigPath(options)
  const raw = readFileSync(filePath, 'utf8')
  const parsed = YAML.parse(raw) as LegionariesConfig | null

  if (!parsed?.agents || typeof parsed.agents !== 'object') {
    throw new Error('legionaries.yaml missing agents map')
  }

  const agents = validateModelMap(parsed.agents)

  return {
    filePath,
    agents,
  }
}
