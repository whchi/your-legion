import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { getOpenCodeConfigDir } from './config/legionaries.ts'

const PLUGIN_NAME = '@whchi/your-legion'

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

export function installYourLegion({
  configDir = getOpenCodeConfigDir(),
  sourceConfigPath,
  now = new Date(),
}: InstallYourLegionOptions): InstallYourLegionResult {
  mkdirSync(configDir, { recursive: true })

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
  }
}
