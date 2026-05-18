import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

import { getOpenCodeConfigDir } from '../config/legionaries.ts'
import type { DomainConfig, ResolvedDomainConfigMap } from '../shared/agent-types.ts'

type DomainComponentKind = 'workflows' | 'decisions' | 'examples' | 'skills'

const DOMAIN_COMPONENTS: DomainComponentKind[] = [
  'workflows',
  'decisions',
  'examples',
  'skills',
]

export type DomainPackComponent = {
  id: string
  path: string
}

export type DomainPack = {
  id: string
  root: string
  components: Record<DomainComponentKind, DomainPackComponent[]>
}

export type ResolveDomainPacksOptions = {
  configDir?: string
  configPath?: string
  domains: ResolvedDomainConfigMap
}

function expandHome(filePath: string) {
  return filePath === '~' || filePath.startsWith('~/')
    ? join(homedir(), filePath.slice(2))
    : filePath
}

function resolveConfiguredPath(filePath: string, baseDir: string) {
  const expandedPath = expandHome(filePath)
  return resolve(expandedPath.startsWith('/') ? expandedPath : join(baseDir, expandedPath))
}

function sortedDirectoryEntries(dir: string) {
  if (!existsSync(dir)) {
    return []
  }

  return readdirSync(dir).sort((left, right) => left.localeCompare(right))
}

function discoverMarkdownFiles(dir: string): DomainPackComponent[] {
  return sortedDirectoryEntries(dir)
    .map((entry) => join(dir, entry))
    .filter((filePath) => statSync(filePath).isFile() && extname(filePath) === '.md')
    .map((filePath) => ({
      id: filePath.slice(dirname(filePath).length + 1, -'.md'.length),
      path: filePath,
    }))
}

function discoverSkillFiles(dir: string): DomainPackComponent[] {
  const components: DomainPackComponent[] = []

  for (const entry of sortedDirectoryEntries(dir)) {
    const entryPath = join(dir, entry)
    const stats = statSync(entryPath)

    if (stats.isFile() && extname(entryPath) === '.md') {
      components.push({
        id: entry.slice(0, -'.md'.length),
        path: entryPath,
      })
      continue
    }

    if (stats.isDirectory()) {
      const skillPath = join(entryPath, 'SKILL.md')
      if (existsSync(skillPath)) {
        components.push({
          id: entry,
          path: skillPath,
        })
      }
    }
  }

  return components
}

function discoverConventionComponents(
  root: string,
  component: DomainComponentKind,
): DomainPackComponent[] {
  const componentDir = join(root, component)
  return component === 'skills'
    ? discoverSkillFiles(componentDir)
    : discoverMarkdownFiles(componentDir)
}

function normalizeDomainConfig(config: DomainConfig) {
  return config === true ? {} : config
}

function applyOverrides(
  components: DomainPackComponent[],
  config: DomainConfig,
  component: DomainComponentKind,
  baseDir: string,
) {
  const byID = new Map(components.map((entry) => [entry.id, entry]))
  const overrides = normalizeDomainConfig(config)[component] ?? {}

  for (const [id, override] of Object.entries(overrides)) {
    if (override === false) {
      byID.delete(id)
      continue
    }

    byID.set(id, {
      id,
      path: resolveConfiguredPath(override.path, baseDir),
    })
  }

  return [...byID.values()].sort((left, right) => left.id.localeCompare(right.id))
}

function resolveDomainRoot(configDir: string, domain: string) {
  return join(configDir, 'your-legion', 'domains', domain)
}

function resolveBundledDomainRoot(domain: string) {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'domains', domain)
}

export function resolveDomainPacks({
  configDir,
  configPath,
  domains,
}: ResolveDomainPacksOptions): DomainPack[] {
  const resolvedConfigDir = configDir ? resolve(configDir) : getOpenCodeConfigDir()
  const overrideBaseDir = configPath ? dirname(resolve(configPath)) : resolvedConfigDir

  return Object.entries(domains)
    .map(([id, config]) => {
      const root = resolveDomainRoot(resolvedConfigDir, id)
      const bundledRoot = resolveBundledDomainRoot(id)
      const components = {} as Record<DomainComponentKind, DomainPackComponent[]>

      for (const component of DOMAIN_COMPONENTS) {
        components[component] = applyOverrides(
          [
            ...discoverConventionComponents(bundledRoot, component),
            ...discoverConventionComponents(root, component),
          ],
          config,
          component,
          overrideBaseDir,
        )
      }

      return {
        id,
        root,
        components,
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

function formatComponent(kind: DomainComponentKind, pack: DomainPack) {
  const components = pack.components[kind]
  if (components.length === 0) {
    return []
  }

  const title = kind[0].toUpperCase() + kind.slice(1)
  return [
    `  ${title}:`,
    ...components.map(
      (component) => `  - \`${pack.id}/${component.id}\` -> ${component.path}`,
    ),
  ]
}

export function buildDomainPromptSection(domainPacks: DomainPack[]) {
  if (domainPacks.length === 0) {
    return ''
  }

  const lines = [
    '## Domain Packs',
    '',
    'Your Legion domain packs are configured capability documents, not harness top-level skills.',
    'Enabled domain packs are an index, not automatically active task context.',
    "Use the Task Context Envelope's Active domains to decide which domain context applies to the current delegation.",
    'Use domain skills from the configured Domain Skill Index by reading the exact path listed below.',
    'Avoid harness-level skill resolution for these entries unless the user explicitly asks for an external harness skill.',
    '',
    'Enabled domain packs:',
  ]

  for (const pack of domainPacks) {
    lines.push(`- \`${pack.id}\` (${pack.root})`)

    for (const component of DOMAIN_COMPONENTS) {
      lines.push(...formatComponent(component, pack))
    }
  }

  return lines.join('\n')
}
