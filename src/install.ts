import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { getOpenCodeConfigDir } from './config/legionaries.ts'

const PLUGIN_NAME = '@whchi/your-legion'
const DOMAIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const DOMAIN_COMPONENT_DIRS = ['workflows', 'decisions', 'examples', 'skills'] as const

export type InstallYourLegionOptions = {
  configDir?: string
  sourceConfigPath: string
  now?: Date
}

export type InstallYourLegionResult = {
  configDir: string
  legionariesConfigPath: string
  legionariesBackupPath?: string
  opencodeConfigPath: string
  domainRootPath: string
}

export type CreateDomainPackOptions = {
  configDir?: string
  domainID: string
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

This domain pack follows the Your Legion convention:

- \`workflows/\`: repeatable domain workflows
- \`decisions/\`: stable domain decisions and guardrails
- \`examples/\`: examples agents can copy or compare against
- \`skills/\`: domain-local skills, either \`<skill>.md\` or \`<skill>/SKILL.md\`

Enable it in \`legionaries.yaml\`:

\`\`\`yaml
domains:
  ${domainID}: true
\`\`\`
`
}

export function installYourLegion({
  configDir = getOpenCodeConfigDir(),
  sourceConfigPath,
  now = new Date(),
}: InstallYourLegionOptions): InstallYourLegionResult {
  mkdirSync(configDir, { recursive: true })
  const domainRootPath = join(configDir, 'your-legion', 'domains')

  mkdirSync(domainRootPath, { recursive: true })

  const legionariesConfigPath = join(configDir, 'legionaries.yaml')
  let legionariesBackupPath: string | undefined

  if (existsSync(legionariesConfigPath)) {
    legionariesBackupPath = `${legionariesConfigPath}.bak.${backupTimestamp(now)}`
    copyFileSync(legionariesConfigPath, legionariesBackupPath)
  }

  copyFileSync(sourceConfigPath, legionariesConfigPath)
  const opencodeConfigPath = registerPlugin(configDir)

  return {
    configDir,
    legionariesConfigPath,
    legionariesBackupPath,
    opencodeConfigPath,
    domainRootPath,
  }
}

export function createDomainPack({
  configDir = getOpenCodeConfigDir(),
  domainID,
}: CreateDomainPackOptions): CreateDomainPackResult {
  if (!DOMAIN_ID_PATTERN.test(domainID)) {
    throw new Error(`invalid domain id: ${domainID}`)
  }

  const domainRootPath = join(configDir, 'your-legion', 'domains', domainID)
  const componentPaths = DOMAIN_COMPONENT_DIRS.map((component) => join(domainRootPath, component))
  const manifestPath = join(domainRootPath, 'README.md')

  mkdirSync(domainRootPath, { recursive: true })
  for (const componentPath of componentPaths) {
    mkdirSync(componentPath, { recursive: true })
  }

  if (!existsSync(manifestPath)) {
    writeFileSync(manifestPath, domainManifest(domainID))
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
