import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

import { AGENT_FACTORIES } from '../agents/index.ts'
import {
  AGENT_NAMES,
  type AgentFactory,
  type AgentMode,
  type BaseAgentDefinition,
  type SystemAgentName,
} from '../shared/agent-types.ts'

const SYSTEM_AGENT_NAMES = new Set<string>(AGENT_NAMES)
const AGENT_MODES = new Set<AgentMode>(['primary', 'subagent', 'all'])
const CUSTOM_PERMISSION_KEYS = [
  'read',
  'glob',
  'grep',
  'lsp',
  'question',
  'skill',
  'todowrite',
  'edit',
  'bash',
  'task',
  'webfetch',
  'websearch',
  'context7_resolve-library-id',
  'context7_query-docs',
]

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

function customAgentDirs(options: AgentDefinitionProviderOptions) {
  const rootDir = resolve(toPath(options.rootDir))
  const moduleDir = dirname(fileURLToPath(import.meta.url))

  return [
    join(moduleDir, 'custom-agents'),
    join(moduleDir, '..', 'custom-agents'),
    join(rootDir, 'src', 'custom-agents'),
  ]
}

function listAgentFiles(dir: string) {
  if (!existsSync(dir)) {
    return []
  }

  return readdirSync(dir)
    .filter((file) => ['.yaml', '.yml'].includes(extname(file)))
    .map((file) => ({
      name: basename(file, extname(file)),
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

function normalizePermission(permission: unknown) {
  const normalized: Record<string, unknown> = Object.fromEntries(
    CUSTOM_PERMISSION_KEYS.map((key) => [key, 'deny']),
  )

  if (!permission || typeof permission !== 'object' || Array.isArray(permission)) {
    return normalized
  }

  for (const [key, value] of Object.entries(permission)) {
    normalized[key] = value
  }

  return normalized
}

function loadCustomAgentDefinition(fileName: string, filePath: string): BaseAgentDefinition {
  const parsed = YAML.parse(readFileSync(filePath, 'utf8')) as
    | {
        name?: unknown
        description?: unknown
        permission?: unknown
        prompt?: unknown
      }
    | null

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`custom agent ${fileName} must be a YAML map`)
  }

  if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
    throw new Error(`custom agent ${fileName} missing name`)
  }

  if (parsed.name !== fileName) {
    throw new Error(`custom agent file ${fileName} name mismatch: ${parsed.name}`)
  }

  return {
    description: typeof parsed.description === 'string' ? parsed.description : '',
    mode: 'subagent',
    permission: normalizePermission(parsed.permission),
    prompt: typeof parsed.prompt === 'string' ? parsed.prompt : '',
  }
}

function asAgentFactory(name: string, definition: BaseAgentDefinition): AgentFactory {
  const factory = ((model: string) => {
    validateAgentDefinition(name, definition)
    return definition
  }) as AgentFactory

  factory.mode = definition.mode

  return factory
}

function loadCustomAgentFactory(name: string, filePath: string) {
  if (SYSTEM_AGENT_NAMES.has(name)) {
    throw new Error(`custom agent cannot replace system agent: ${name}`)
  }

  return asAgentFactory(name, loadCustomAgentDefinition(name, filePath))
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
    custom[name] = loadCustomAgentFactory(name, filePath)
  }

  return {
    system: AGENT_FACTORIES,
    custom,
  }
}
