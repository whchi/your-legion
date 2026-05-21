import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

import { getOpenCodeConfigDir } from './config/legionaries';

const PLUGIN_NAME = '@whchi/your-legion';
const DOMAIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const DOMAIN_COMPONENT_DIRS = ['workflows', 'decisions', 'examples', 'skills'] as const;
export const AVAILABLE_DOMAIN_IDS = ['coding', 'marketing', 'finance', 'accounting'] as const;
const DEFAULT_DOMAIN_IDS = ['coding'] as const;

export type DomainComponentDir = (typeof DOMAIN_COMPONENT_DIRS)[number];

export type InstallYourLegionOptions = {
  configDir?: string;
  sourceConfigPath: string;
  now?: Date;
  enabledDomains?: string[];
  addDomains?: string[];
};

export type InstallYourLegionResult = {
  configDir: string;
  legionariesConfigPath: string;
  legionariesBackupPath?: string;
  opencodeConfigPath: string;
  domainRootPath: string;
  enabledDomains: string[];
  configAction: 'created' | 'preserved' | 'replaced' | 'updated';
};

export type CreateDomainPackOptions = {
  configDir?: string;
  domainID: string;
  components?: DomainComponentDir[];
  enable?: boolean;
};

export type CreateDomainPackResult = {
  configDir: string;
  domainID: string;
  domainRootPath: string;
  componentPaths: string[];
  descriptionPath: string;
  enabled: boolean;
  enablementSnippet: string;
};

function backupTimestamp(now: Date) {
  return now.toISOString().replace(/[:.]/g, '-');
}

function parseJsonConfig(path: string) {
  if (!existsSync(path)) {
    return {};
  }

  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function writeJsonConfig(path: string, value: Record<string, unknown>) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function resolveOpenCodeConfigPath(configDir: string) {
  const jsonPath = join(configDir, 'opencode.json');
  if (existsSync(jsonPath)) {
    return jsonPath;
  }

  return jsonPath;
}

function registerPlugin(configDir: string) {
  const configPath = resolveOpenCodeConfigPath(configDir);
  const config = parseJsonConfig(configPath);
  const plugins = Array.isArray(config.plugin) ? config.plugin : [];

  if (!plugins.includes(PLUGIN_NAME)) {
    plugins.push(PLUGIN_NAME);
  }

  config.plugin = plugins;
  writeJsonConfig(configPath, config);

  return configPath;
}

function domainDescriptionTemplate(domainID: string, components: DomainComponentDir[]) {
  const sections = components.map(component => {
    switch (component) {
      case 'workflows':
        return `Workflows:
- \`workflows/example-workflow.md\``;
      case 'decisions':
        return `Decisions:
- \`decisions/example-decision.md\``;
      case 'examples':
        return `Examples:
- \`examples/example-output.md\``;
      case 'skills':
        return `Skills:
- \`skills/example-skill/SKILL.md\``;
    }
  });

  return `# ${domainID} Domain

Use this domain when the task involves ...

Do not use this domain when ...

${sections.join('\n\n')}
`;
}

function scaffoldDomainComponentFiles(domainRootPath: string, components: DomainComponentDir[]) {
  for (const component of components) {
    switch (component) {
      case 'workflows': {
        const path = join(domainRootPath, 'workflows', 'example-workflow.md');
        if (!existsSync(path)) {
          writeFileSync(path, '# Example Workflow\n\nDescribe the repeatable workflow for this domain.\n');
        }
        break;
      }
      case 'decisions': {
        const path = join(domainRootPath, 'decisions', 'example-decision.md');
        if (!existsSync(path)) {
          writeFileSync(path, '# Example Decision\n\nDescribe constraints, guardrails, or decision rules for this domain.\n');
        }
        break;
      }
      case 'examples': {
        const path = join(domainRootPath, 'examples', 'example-output.md');
        if (!existsSync(path)) {
          writeFileSync(path, '# Example Output\n\nShow a representative accepted output or pattern for this domain.\n');
        }
        break;
      }
      case 'skills': {
        const skillRoot = join(domainRootPath, 'skills', 'example-skill');
        const path = join(skillRoot, 'SKILL.md');
        mkdirSync(skillRoot, { recursive: true });
        if (!existsSync(path)) {
          writeFileSync(
            path,
            `---
name: example-skill
description: Replace this placeholder with a concise description of when to use this domain skill.
---

# Example Skill

Describe the domain-specific procedure this skill should guide.
`,
          );
        }
        break;
      }
    }
  }
}

function normalizeDomainComponents(components: DomainComponentDir[] = []) {
  const allowed = new Set<string>(DOMAIN_COMPONENT_DIRS);
  const normalized = [...new Set(components.map(component => component.trim()).filter(Boolean))];

  for (const component of normalized) {
    if (!allowed.has(component)) {
      throw new Error(`unknown domain component: ${component}`);
    }
  }

  return normalized as DomainComponentDir[];
}

function isExistingGlobalDomain(configDir: string, domainID: string) {
  return existsSync(join(configDir, 'your-legion', 'domains', domainID, 'DOMAIN.md'));
}

function normalizeEnabledDomains(configDir: string, enabledDomains: string[] = [...DEFAULT_DOMAIN_IDS]) {
  const bundled = new Set<string>(AVAILABLE_DOMAIN_IDS);
  const normalized = [...new Set(enabledDomains.map(domain => domain.trim()).filter(Boolean))];

  for (const domain of normalized) {
    if (!DOMAIN_ID_PATTERN.test(domain)) {
      throw new Error(`invalid domain id: ${domain}`);
    }

    if (!bundled.has(domain) && !isExistingGlobalDomain(configDir, domain)) {
      throw new Error(`unknown domain: ${domain}`);
    }
  }

  return normalized.length === 0 ? [...DEFAULT_DOMAIN_IDS] : normalized;
}

function writeLegionariesConfigWithDomains(
  baseConfigPath: string,
  targetConfigPath: string,
  enabledDomains: string[],
) {
  const raw = readFileSync(baseConfigPath, 'utf8');
  const parsed = YAML.parse(raw) as Record<string, unknown>;

  parsed.domains = Object.fromEntries(enabledDomains.map(domain => [domain, true]));
  writeFileSync(targetConfigPath, YAML.stringify(parsed));
}

function readEnabledDomains(configPath: string) {
  const parsed = (YAML.parse(readFileSync(configPath, 'utf8')) ?? {}) as Record<string, unknown>;
  if (!parsed.domains || typeof parsed.domains !== 'object' || Array.isArray(parsed.domains)) {
    return [];
  }

  return Object.keys(parsed.domains as Record<string, unknown>);
}

function enableDomainInLegionariesConfig(configDir: string, domainID: string) {
  const configPath = join(configDir, 'legionaries.yaml');

  if (!existsSync(configPath)) {
    throw new Error(`cannot enable domain before install: ${configPath} does not exist`);
  }

  const parsed = (YAML.parse(readFileSync(configPath, 'utf8')) ?? {}) as Record<string, unknown>;
  const existingDomains =
    parsed.domains && typeof parsed.domains === 'object' && !Array.isArray(parsed.domains)
      ? (parsed.domains as Record<string, unknown>)
      : {};

  parsed.domains = {
    ...existingDomains,
    [domainID]: true,
  };
  writeFileSync(configPath, YAML.stringify(parsed));
}

function assertCanEnableDomain(configDir: string) {
  const configPath = join(configDir, 'legionaries.yaml');

  if (!existsSync(configPath)) {
    throw new Error(`cannot enable domain before install: ${configPath} does not exist`);
  }
}

export function installYourLegion({
  configDir = getOpenCodeConfigDir(),
  sourceConfigPath,
  now = new Date(),
  enabledDomains,
  addDomains,
}: InstallYourLegionOptions): InstallYourLegionResult {
  if (enabledDomains !== undefined && addDomains !== undefined) {
    throw new Error('use either --domains or --add-domains, not both');
  }

  mkdirSync(configDir, { recursive: true });
  const domainRootPath = join(configDir, 'your-legion', 'domains');
  const normalizedReplacementDomains =
    enabledDomains === undefined ? undefined : normalizeEnabledDomains(configDir, enabledDomains);
  const normalizedAddDomains = addDomains === undefined ? undefined : normalizeEnabledDomains(configDir, addDomains);

  mkdirSync(domainRootPath, { recursive: true });

  const legionariesConfigPath = join(configDir, 'legionaries.yaml');
  let legionariesBackupPath: string | undefined;
  let configAction: InstallYourLegionResult['configAction'];

  const configExists = existsSync(legionariesConfigPath);
  const shouldWriteConfig = !configExists || normalizedReplacementDomains !== undefined || normalizedAddDomains !== undefined;

  if (configExists && shouldWriteConfig) {
    legionariesBackupPath = `${legionariesConfigPath}.bak.${backupTimestamp(now)}`;
    copyFileSync(legionariesConfigPath, legionariesBackupPath);
  }

  if (!configExists && normalizedReplacementDomains === undefined && normalizedAddDomains === undefined) {
    copyFileSync(sourceConfigPath, legionariesConfigPath);
    configAction = 'created';
  } else if (normalizedReplacementDomains !== undefined) {
    writeLegionariesConfigWithDomains(sourceConfigPath, legionariesConfigPath, normalizedReplacementDomains);
    configAction = configExists ? 'replaced' : 'created';
  } else if (normalizedAddDomains !== undefined) {
    const baseConfigPath = configExists ? legionariesConfigPath : sourceConfigPath;
    const existingDomains = configExists ? readEnabledDomains(legionariesConfigPath) : [...DEFAULT_DOMAIN_IDS];
    const mergedDomains = [...new Set([...existingDomains, ...normalizedAddDomains])];
    writeLegionariesConfigWithDomains(baseConfigPath, legionariesConfigPath, mergedDomains);
    configAction = configExists ? 'updated' : 'created';
  } else {
    configAction = 'preserved';
  }
  const opencodeConfigPath = registerPlugin(configDir);
  const resolvedEnabledDomains = readEnabledDomains(legionariesConfigPath);

  return {
    configDir,
    legionariesConfigPath,
    legionariesBackupPath,
    opencodeConfigPath,
    domainRootPath,
    enabledDomains: resolvedEnabledDomains,
    configAction,
  };
}

export function createDomainPack({
  configDir = getOpenCodeConfigDir(),
  domainID,
  components = [],
  enable = false,
}: CreateDomainPackOptions): CreateDomainPackResult {
  if (!DOMAIN_ID_PATTERN.test(domainID)) {
    throw new Error(`invalid domain id: ${domainID}`);
  }

  const selectedComponents = normalizeDomainComponents(components);
  const domainRootPath = join(configDir, 'your-legion', 'domains', domainID);
  if (AVAILABLE_DOMAIN_IDS.includes(domainID as (typeof AVAILABLE_DOMAIN_IDS)[number]) || existsSync(domainRootPath)) {
    throw new Error(`domain already exists: ${domainID}`);
  }
  if (enable) {
    assertCanEnableDomain(configDir);
  }

  const componentPaths = selectedComponents.map(component => join(domainRootPath, component));
  const descriptionPath = join(domainRootPath, 'DOMAIN.md');

  mkdirSync(domainRootPath, { recursive: true });
  for (const componentPath of componentPaths) {
    mkdirSync(componentPath, { recursive: true });
  }
  scaffoldDomainComponentFiles(domainRootPath, selectedComponents);

  if (!existsSync(descriptionPath)) {
    writeFileSync(descriptionPath, domainDescriptionTemplate(domainID, selectedComponents));
  }
  if (enable) {
    enableDomainInLegionariesConfig(configDir, domainID);
  }

  return {
    configDir,
    domainID,
    domainRootPath,
    componentPaths,
    descriptionPath,
    enabled: enable,
    enablementSnippet: `domains:\n  ${domainID}: true\n`,
  };
}
