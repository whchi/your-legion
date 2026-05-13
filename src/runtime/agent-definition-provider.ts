import { existsSync, readdirSync } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { AGENT_FACTORIES } from '../agents/index.ts'
import { getOpenCodeConfigDir } from '../config/legionaries.ts'
import {
  AGENT_NAMES,
  type AgentFactory,
  type AgentMode,
  type BaseAgentDefinition,
  type LoadableAgentFactory,
  type SystemAgentName,
} from '../shared/agent-types.ts'

const SYSTEM_AGENT_NAMES = new Set<string>(AGENT_NAMES)
const AGENT_MODES = new Set<AgentMode>(['primary', 'subagent', 'all'])

export type AgentDefinitionProviderOptions = {
  rootDir: string | URL
  configDir?: string | URL
}

export type ResolvedAgentDefinitions = {
  system: Record<SystemAgentName, AgentFactory>
  custom: Record<string, AgentFactory>
}

function toPath(value: string | URL) {
  return value instanceof URL ? fileURLToPath(value) : value
}

function pascalCase(value: string) {
  return value
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join('')
}

function customAgentDirs(options: AgentDefinitionProviderOptions) {
  const rootDir = resolve(toPath(options.rootDir))
  const configDir = options.configDir
    ? resolve(toPath(options.configDir))
    : getOpenCodeConfigDir()

  return [
    join(configDir, 'your-legion', 'agents'),
    join(rootDir, '.opencode', 'your-legion', 'agents'),
  ]
}

function listAgentFiles(dir: string) {
  if (!existsSync(dir)) {
    return []
  }

  return readdirSync(dir)
    .filter((file) => extname(file) === '.ts')
    .map((file) => ({
      name: basename(file, '.ts'),
      path: join(dir, file),
    }))
}

function validateAgentDefinition(name: string, definition: BaseAgentDefinition) {
  if (!definition || typeof definition !== 'object') {
    throw new Error(`custom agent ${name} did not return an agent definition`)
  }

  if (!definition.description || typeof definition.description !== 'string') {
    throw new Error(`custom agent ${name} missing description`)
  }

  if (!AGENT_MODES.has(definition.mode)) {
    throw new Error(`custom agent ${name} has invalid mode: ${definition.mode}`)
  }

  if (!definition.permission || typeof definition.permission !== 'object') {
    throw new Error(`custom agent ${name} missing permission`)
  }

  if (!definition.prompt || typeof definition.prompt !== 'string') {
    throw new Error(`custom agent ${name} missing prompt`)
  }
}

function asAgentFactory(name: string, value: unknown): AgentFactory {
  if (typeof value !== 'function') {
    throw new Error(`custom agent ${name} must export an agent factory`)
  }

  const factory = ((model: string) => {
    const definition = (value as LoadableAgentFactory)(model)
    validateAgentDefinition(name, definition)
    return definition
  }) as AgentFactory

  const mode = (value as Partial<AgentFactory>).mode
  factory.mode = mode && AGENT_MODES.has(mode) ? mode : 'subagent'

  return factory
}

async function importCustomAgentFactory(name: string, filePath: string) {
  if (SYSTEM_AGENT_NAMES.has(name)) {
    throw new Error(`custom agent cannot replace system agent: ${name}`)
  }

  const module = await import(pathToFileURL(filePath).href)
  const namedExport = `create${pascalCase(name)}Agent`
  const exported = module.default ?? module[namedExport]

  return asAgentFactory(name, exported)
}

export async function loadAgentDefinitionProviders(
  options: AgentDefinitionProviderOptions,
): Promise<ResolvedAgentDefinitions> {
  const customAgentFiles = new Map<string, string>()

  for (const dir of customAgentDirs(options)) {
    for (const file of listAgentFiles(dir)) {
      customAgentFiles.set(file.name, file.path)
    }
  }

  const custom: Record<string, AgentFactory> = {}
  for (const [name, filePath] of customAgentFiles) {
    custom[name] = await importCustomAgentFactory(name, filePath)
  }

  return {
    system: AGENT_FACTORIES,
    custom,
  }
}
