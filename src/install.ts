import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'

import { getOpenCodeConfigDir } from './config/legionaries.ts'

const PLUGIN_NAME = '@whchi/your-legion'
const DOMAIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
export const DOMAIN_COMPONENT_DIRS = ['workflows', 'decisions', 'examples', 'skills'] as const
export const AVAILABLE_DOMAIN_IDS = ['coding', 'marketing', 'finance', 'accounting'] as const
const DEFAULT_DOMAIN_IDS = ['coding'] as const

export type DomainComponentDir = (typeof DOMAIN_COMPONENT_DIRS)[number]

export type InstallYourLegionOptions = {
  configDir?: string
  sourceConfigPath: string
  now?: Date
  enabledDomains?: string[]
}

export type InstallYourLegionResult = {
  configDir: string
  legionariesConfigPath: string
  legionariesBackupPath?: string
  opencodeConfigPath: string
  domainRootPath: string
  enabledDomains: string[]
}

export type CreateDomainPackOptions = {
  configDir?: string
  domainID: string
  components?: DomainComponentDir[]
}

export type CreateDomainPackResult = {
  configDir: string
  domainID: string
  domainRootPath: string
  componentPaths: string[]
  manifestPath: string
  enablementSnippet: string
}

function backupTimestamp(now: Date) {
  return now.toISOString().replace(/[:.]/g, '-')
}

function parseJsonConfig(path: string) {
  if (!existsSync(path)) {
    return {}
  }

  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function writeJsonConfig(path: string, value: Record<string, unknown>) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function resolveOpenCodeConfigPath(configDir: string) {
  const jsoncPath = join(configDir, 'opencode.jsonc')
  if (existsSync(jsoncPath)) {
    return jsoncPath
  }

  const jsonPath = join(configDir, 'opencode.json')
  if (existsSync(jsonPath)) {
    return jsonPath
  }

  return jsonPath
}

function registerPlugin(configDir: string) {
  const configPath = resolveOpenCodeConfigPath(configDir)
  const config = parseJsonConfig(configPath)
  const plugins = Array.isArray(config.plugin) ? config.plugin : []

  if (!plugins.includes(PLUGIN_NAME)) {
    plugins.push(PLUGIN_NAME)
  }

  config.plugin = plugins
  writeJsonConfig(configPath, config)

  return configPath
}

function domainManifest(domainID: string) {
  return `# ${domainID}

This domain pack is a context and knowledge boundary for Your Legion.

Use \`DOMAIN.md\` for the short semantic description that appears in the
Domain Catalog. This \`README.md\` is human-facing documentation only.
When adding components, list domain-root relative paths in \`DOMAIN.md\`, for
example \`workflows/example-workflow.md\` or \`skills/example-skill/SKILL.md\`.

Component folders are optional capability facets. Create only the folders that
carry real, versioned knowledge for this domain:

- \`workflows/\`: repeatable ways of doing domain work
- \`decisions/\`: stable constraints, guardrails, and policy decisions
- \`examples/\`: representative past work, edge cases, and output patterns
- \`skills/\`: domain-local skills, either \`<skill>.md\` or \`<skill>/SKILL.md\`

A domain should have at least one useful component before agents use it as
active task context. Do not create empty folders just to satisfy a template.

Enable it in \`legionaries.yaml\`:

\`\`\`yaml
domains:
  ${domainID}: true
\`\`\`
`
}

function domainDescriptionTemplate(domainID: string, components: DomainComponentDir[]) {
  const sections = components.map((component) => {
    switch (component) {
      case 'workflows':
        return `Workflows:
- \`workflows/example-workflow.md\``
      case 'decisions':
        return `Decisions:
- \`decisions/example-decision.md\``
      case 'examples':
        return `Examples:
- \`examples/example-output.md\``
      case 'skills':
        return `Skills:
- \`skills/example-skill/SKILL.md\``
    }
  })

  return `# ${domainID} Domain

Use this domain when the task involves ...

Do not use this domain when ...

${sections.join('\n\n')}
`
}

function normalizeDomainComponents(components: DomainComponentDir[] = []) {
  const allowed = new Set<string>(DOMAIN_COMPONENT_DIRS)
  const normalized = [...new Set(components.map((component) => component.trim()).filter(Boolean))]

  for (const component of normalized) {
    if (!allowed.has(component)) {
      throw new Error(`unknown domain component: ${component}`)
    }
  }

  return normalized as DomainComponentDir[]
}

function normalizeEnabledDomains(enabledDomains: string[] = [...DEFAULT_DOMAIN_IDS]) {
  const available = new Set<string>(AVAILABLE_DOMAIN_IDS)
  const normalized = [...new Set(enabledDomains.map((domain) => domain.trim()).filter(Boolean))]

  for (const domain of normalized) {
    if (!available.has(domain)) {
      throw new Error(`unknown domain: ${domain}`)
    }
  }

  return normalized.length === 0 ? [...DEFAULT_DOMAIN_IDS] : normalized
}

function writeLegionariesConfigWithDomains(
  sourceConfigPath: string,
  targetConfigPath: string,
  enabledDomains: string[],
) {
  const raw = readFileSync(sourceConfigPath, 'utf8')
  const parsed = YAML.parse(raw) as Record<string, unknown>

  parsed.domains = Object.fromEntries(enabledDomains.map((domain) => [domain, true]))
  writeFileSync(targetConfigPath, YAML.stringify(parsed))
}

export function installYourLegion({
  configDir = getOpenCodeConfigDir(),
  sourceConfigPath,
  now = new Date(),
  enabledDomains,
}: InstallYourLegionOptions): InstallYourLegionResult {
  mkdirSync(configDir, { recursive: true })
  const domainRootPath = join(configDir, 'your-legion', 'domains')
  const resolvedEnabledDomains = normalizeEnabledDomains(enabledDomains)

  mkdirSync(domainRootPath, { recursive: true })

  const legionariesConfigPath = join(configDir, 'legionaries.yaml')
  let legionariesBackupPath: string | undefined

  if (existsSync(legionariesConfigPath)) {
    legionariesBackupPath = `${legionariesConfigPath}.bak.${backupTimestamp(now)}`
    copyFileSync(legionariesConfigPath, legionariesBackupPath)
  }

  if (enabledDomains === undefined) {
    copyFileSync(sourceConfigPath, legionariesConfigPath)
  } else {
    writeLegionariesConfigWithDomains(
      sourceConfigPath,
      legionariesConfigPath,
      resolvedEnabledDomains,
    )
  }
  const opencodeConfigPath = registerPlugin(configDir)

  return {
    configDir,
    legionariesConfigPath,
    legionariesBackupPath,
    opencodeConfigPath,
    domainRootPath,
    enabledDomains: resolvedEnabledDomains,
  }
}

export function createDomainPack({
  configDir = getOpenCodeConfigDir(),
  domainID,
  components = [],
}: CreateDomainPackOptions): CreateDomainPackResult {
  if (!DOMAIN_ID_PATTERN.test(domainID)) {
    throw new Error(`invalid domain id: ${domainID}`)
  }

  const selectedComponents = normalizeDomainComponents(components)
  const domainRootPath = join(configDir, 'your-legion', 'domains', domainID)
  const componentPaths = selectedComponents.map((component) => join(domainRootPath, component))
  const manifestPath = join(domainRootPath, 'README.md')
  const descriptionPath = join(domainRootPath, 'DOMAIN.md')

  mkdirSync(domainRootPath, { recursive: true })
  for (const componentPath of componentPaths) {
    mkdirSync(componentPath, { recursive: true })
  }

  if (!existsSync(manifestPath)) {
    writeFileSync(manifestPath, domainManifest(domainID))
  }
  if (!existsSync(descriptionPath)) {
    writeFileSync(descriptionPath, domainDescriptionTemplate(domainID, selectedComponents))
  }

  return {
    configDir,
    domainID,
    domainRootPath,
    componentPaths,
    manifestPath,
    enablementSnippet: `domains:\n  ${domainID}: true\n`,
  }
}
