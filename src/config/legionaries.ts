import { readFileSync } from 'node:fs';
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
  type LoopConfig,
  type ResolvedLegionaryEntry,
  type ResolvedCustomLegionariesMap,
  type ResolvedDomainConfigMap,
  type ResolvedLegionariesMap,
  type ResolvedLoopConfigMap,
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

  const configRoot = configDir ? resolve(toPath(configDir)) : getOpenCodeConfigDir();
  return join(configRoot, 'legionaries.yaml');
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
    if (models[agent] === undefined) {
      throw new Error(
        `missing model for required system agent: ${agent}. Add system_agents.${agent}.model to legionaries.yaml using provider/model-id format.`,
      );
    }
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

function assertNonEmptyString(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

function assertStringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${field} must be a string array`);
  }
}

function validateLoopConfigMap(loops: Record<string, LoopConfig> = {}): ResolvedLoopConfigMap {
  const resolvedLoops: ResolvedLoopConfigMap = {};

  if (!loops || typeof loops !== 'object' || Array.isArray(loops)) {
    throw new Error('legionaries.yaml loops must be a map');
  }

  for (const [loopID, loop] of Object.entries(loops)) {
    assertDomainID(loopID);

    if (!loop || typeof loop !== 'object' || Array.isArray(loop)) {
      throw new Error(`loops.${loopID} must be a map`);
    }

    assertNonEmptyString(loop.description, `loops.${loopID}.description`);
    assertNonEmptyString(loop.objective, `loops.${loopID}.objective`);
    assertNonEmptyString(loop.inbox_path, `loops.${loopID}.inbox_path`);
    if (isAbsolute(loop.inbox_path) || loop.inbox_path.split('/').includes('..')) {
      throw new Error(`loops.${loopID}.inbox_path must be a relative repo path`);
    }

    if (!loop.trigger || typeof loop.trigger !== 'object' || Array.isArray(loop.trigger)) {
      throw new Error(`loops.${loopID}.trigger must be a map`);
    }
    if (!['manual', 'scheduled', 'external'].includes(loop.trigger.type)) {
      throw new Error(`loops.${loopID}.trigger.type must be manual, scheduled, or external`);
    }
    if (loop.trigger.type === 'scheduled') {
      assertNonEmptyString(loop.trigger.cadence, `loops.${loopID}.trigger.cadence`);
    }

    if (!loop.verification || typeof loop.verification !== 'object' || Array.isArray(loop.verification)) {
      throw new Error(`loops.${loopID}.verification must be a map`);
    }
    assertStringArray(loop.verification.commands, `loops.${loopID}.verification.commands`);
    if (loop.verification.commands.length === 0) {
      throw new Error(`loops.${loopID}.verification.commands must contain at least one command`);
    }
    assertNonEmptyString(loop.verification.completion, `loops.${loopID}.verification.completion`);

    if (loop.active_domains !== undefined) {
      if (!Array.isArray(loop.active_domains)) {
        throw new Error(`loops.${loopID}.active_domains must be an array`);
      }
      for (const [index, domain] of loop.active_domains.entries()) {
        assertDomainID(domain.id);
        assertNonEmptyString(domain.responsibility, `loops.${loopID}.active_domains.${index}.responsibility`);
      }
    }
    if (loop.domain_refs !== undefined) {
      assertStringArray(loop.domain_refs, `loops.${loopID}.domain_refs`);
    }
    if (loop.domain_skills !== undefined) {
      assertStringArray(loop.domain_skills, `loops.${loopID}.domain_skills`);
    }
    if (loop.agents !== undefined) {
      for (const [role, agent] of Object.entries(loop.agents)) {
        assertAgentName(agent);
        if (!['triage', 'maker', 'verifier'].includes(role)) {
          throw new Error(`loops.${loopID}.agents.${role} is not supported`);
        }
      }
    }
    if (loop.worktree?.isolation && !['required', 'optional', 'none'].includes(loop.worktree.isolation)) {
      throw new Error(`loops.${loopID}.worktree.isolation must be required, optional, or none`);
    }
    if (loop.connectors?.mode && !['manual', 'external'].includes(loop.connectors.mode)) {
      throw new Error(`loops.${loopID}.connectors.mode must be manual or external`);
    }

    resolvedLoops[loopID] = loop;
  }

  return resolvedLoops;
}

function resolveConfiguredMaps(parsed: LegionariesConfig | null) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('legionaries.yaml missing system_agents map');
  }

  if (!parsed.system_agents || typeof parsed.system_agents !== 'object') {
    throw new Error('legionaries.yaml missing system_agents map');
  }

  if (parsed.custom_agents !== undefined && (!parsed.custom_agents || typeof parsed.custom_agents !== 'object')) {
    throw new Error('legionaries.yaml custom_agents must be a map');
  }

  return {
    systemAgents: parsed.system_agents,
    customAgents: parsed.custom_agents ?? {},
    domains: parsed.domains ?? {},
    loops: parsed.loops ?? {},
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
  const loops = validateLoopConfigMap(configuredMaps.loops);

  return {
    filePath,
    systemAgents,
    customAgents,
    domains,
    loops,
  };
}
