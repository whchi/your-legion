import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, resolve } from 'node:path';
import YAML from 'yaml';

import {
  AGENT_NAMES,
  REQUIRED_AGENT_NAMES,
  type DomainComponentOverrides,
  type DomainConfig,
  type CustomAgentName,
  type LegionariesConfig,
  type LegionaryEntry,
  type ResolvedLegionaryEntry,
  type ResolvedCustomLegionariesMap,
  type ResolvedDomainConfigMap,
  type ResolvedLegionariesMap,
  type ReasoningEffort,
  type SystemAgentName,
} from '../shared/agent-types';

export const MODEL_PATTERN = /^[a-z0-9][a-z0-9-]*\/.+$/i;
export const AGENT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;
const REASONING_EFFORTS = new Set<ReasoningEffort>(['low', 'medium', 'high', 'xhigh', 'max']);
const SYSTEM_AGENT_NAMES = new Set<string>(AGENT_NAMES);

export type LoadLegionariesConfigOptions = {
  rootDir: string | URL;
  configPath?: string | URL;
  configDir?: string | URL;
};

function toPath(value: string | URL) {
  if (value instanceof URL) {
    return fileURLToPath(value);
  }

  return value;
}

export function resolveLegionariesConfigPath({ rootDir, configPath, configDir }: LoadLegionariesConfigOptions) {
  const rootPath = resolve(toPath(rootDir));

  if (configPath) {
    if (configPath instanceof URL) {
      return toPath(configPath);
    }

    return isAbsolute(configPath) ? configPath : resolve(rootPath, configPath);
  }

  if (process.env.LEGIONARIES_CONFIG) {
    return resolve(process.env.LEGIONARIES_CONFIG);
  }

  const projectConfigPath = join(rootPath, 'legionaries.yaml');
  if (existsSync(projectConfigPath)) {
    return projectConfigPath;
  }

  const configRoot = configDir ? resolve(toPath(configDir)) : getOpenCodeConfigDir();
  const globalConfigPath = join(configRoot, 'legionaries.yaml');
  if (existsSync(globalConfigPath)) {
    return globalConfigPath;
  }

  return projectConfigPath;
}

export function getOpenCodeConfigDir(env: NodeJS.ProcessEnv = process.env) {
  return env.XDG_CONFIG_HOME ? join(env.XDG_CONFIG_HOME, 'opencode') : join(homedir(), '.config', 'opencode');
}

function assertAgentName(agent: string) {
  if (!AGENT_NAME_PATTERN.test(agent)) {
    throw new Error(`invalid agent name: ${agent}`);
  }
}

function assertDomainID(domain: string) {
  if (!AGENT_NAME_PATTERN.test(domain)) {
    throw new Error(`invalid domain id: ${domain}`);
  }
}

function normalizeAgentEntry(agent: string, entry: LegionaryEntry | undefined): ResolvedLegionaryEntry {
  const resolved = typeof entry === 'string' ? { model: entry } : entry;

  if (!resolved?.model) {
    throw new Error(`missing model for agent: ${agent}`);
  }

  if (!MODEL_PATTERN.test(resolved.model)) {
    throw new Error(`invalid model format for ${agent}: ${resolved.model}`);
  }

  if (resolved.reasoning && !REASONING_EFFORTS.has(resolved.reasoning.effort)) {
    throw new Error(`invalid reasoning effort for ${agent}: ${resolved.reasoning.effort}`);
  }

  return resolved;
}

function validateModelMap(models: Partial<Record<SystemAgentName, LegionaryEntry>>): ResolvedLegionariesMap {
  const resolvedModels = {} as ResolvedLegionariesMap;

  for (const agent of REQUIRED_AGENT_NAMES) {
    resolvedModels[agent] = normalizeAgentEntry(agent, models[agent]);
  }

  return resolvedModels;
}

function validateCustomModelMap(models: Record<CustomAgentName, LegionaryEntry> = {}): ResolvedCustomLegionariesMap {
  const resolvedModels: ResolvedCustomLegionariesMap = {};

  for (const [agent, entry] of Object.entries(models)) {
    assertAgentName(agent);

    if (SYSTEM_AGENT_NAMES.has(agent)) {
      throw new Error(`custom agent cannot replace system agent: ${agent}`);
    }

    resolvedModels[agent] = normalizeAgentEntry(agent, entry);
  }

  return resolvedModels;
}

function validateDomainComponentOverrides(
  domain: string,
  component: string,
  overrides: unknown,
): DomainComponentOverrides | undefined {
  if (overrides === undefined) {
    return undefined;
  }

  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new Error(`domains.${domain}.${component} must be a map`);
  }

  for (const [id, override] of Object.entries(overrides)) {
    assertDomainID(id);

    if (override === false) {
      continue;
    }

    if (
      !override ||
      typeof override !== 'object' ||
      Array.isArray(override) ||
      typeof (override as Record<string, unknown>).path !== 'string'
    ) {
      throw new Error(`domains.${domain}.${component}.${id} must be false or { path }`);
    }
  }

  return overrides as DomainComponentOverrides;
}

function validateDomainConfigMap(domains: Record<string, DomainConfig> = {}): ResolvedDomainConfigMap {
  const resolvedDomains: ResolvedDomainConfigMap = {};

  if (!domains || typeof domains !== 'object' || Array.isArray(domains)) {
    throw new Error('legionaries.yaml domains must be a map');
  }

  for (const [domain, config] of Object.entries(domains)) {
    assertDomainID(domain);

    if (config === true) {
      resolvedDomains[domain] = true;
      continue;
    }

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`domains.${domain} must be true or a map`);
    }

    resolvedDomains[domain] = {
      workflows: validateDomainComponentOverrides(domain, 'workflows', config.workflows),
      decisions: validateDomainComponentOverrides(domain, 'decisions', config.decisions),
      examples: validateDomainComponentOverrides(domain, 'examples', config.examples),
      skills: validateDomainComponentOverrides(domain, 'skills', config.skills),
    };
  }

  return resolvedDomains;
}

function resolveConfiguredMaps(parsed: LegionariesConfig | null) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('legionaries.yaml missing system_agents map');
  }

  const hasNewSchema = parsed.system_agents !== undefined || parsed.custom_agents !== undefined;
  const systemAgents = hasNewSchema ? parsed.system_agents : parsed.agents;

  if (!systemAgents || typeof systemAgents !== 'object') {
    throw new Error('legionaries.yaml missing system_agents map');
  }

  if (parsed.custom_agents !== undefined && (!parsed.custom_agents || typeof parsed.custom_agents !== 'object')) {
    throw new Error('legionaries.yaml custom_agents must be a map');
  }

  return {
    systemAgents,
    customAgents: parsed.custom_agents ?? {},
    domains: parsed.domains ?? {},
  };
}

export function loadLegionariesConfig(options: LoadLegionariesConfigOptions) {
  const filePath = resolveLegionariesConfigPath(options);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = YAML.parse(raw) as LegionariesConfig | null;

  const configuredMaps = resolveConfiguredMaps(parsed);

  const systemAgents = validateModelMap(configuredMaps.systemAgents);
  const customAgents = validateCustomModelMap(configuredMaps.customAgents);
  const domains = validateDomainConfigMap(configuredMaps.domains);

  return {
    filePath,
    systemAgents,
    customAgents,
    domains,
  };
}
