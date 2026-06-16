import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import { getOpenCodeConfigDir } from '../config/legionaries';
import type { DomainConfig, ResolvedDomainConfigMap } from '../shared/agent-types';

type DomainComponentKind = 'workflows' | 'decisions' | 'examples' | 'skills';

const DOMAIN_COMPONENTS: DomainComponentKind[] = ['workflows', 'decisions', 'examples', 'skills'];
const DOMAIN_DESCRIPTION_FILE = 'DOMAIN.md';
const DOMAIN_DESCRIPTION_MAX_CHARS = 1200;
const DOMAIN_COMPONENT_HEADINGS: Record<DomainComponentKind, string> = {
  workflows: 'Workflows:',
  decisions: 'Decisions:',
  examples: 'Examples:',
  skills: 'Skills:',
};

export type DomainPackComponent = {
  id: string;
  path: string;
  whenToUse?: string;
  signals: string[];
};

export type DomainPack = {
  id: string;
  root: string;
  description: string;
  descriptionPath?: string;
  descriptionTruncated: boolean;
  components: Record<DomainComponentKind, DomainPackComponent[]>;
};

export type ResolveDomainPacksOptions = {
  configDir?: string;
  configPath?: string;
  domains: ResolvedDomainConfigMap;
};

function expandHome(filePath: string) {
  return filePath === '~' || filePath.startsWith('~/') ? join(homedir(), filePath.slice(2)) : filePath;
}

function resolveConfiguredPath(filePath: string, baseDir: string) {
  const expandedPath = expandHome(filePath);
  return resolve(expandedPath.startsWith('/') ? expandedPath : join(baseDir, expandedPath));
}

function normalizeDomainConfig(config: DomainConfig) {
  return config === true ? {} : config;
}

function componentMetadata(filePath: string): Pick<DomainPackComponent, 'whenToUse' | 'signals'> {
  const emptyMetadata = {
    whenToUse: undefined,
    signals: [],
  };

  if (!existsSync(filePath)) {
    return emptyMetadata;
  }

  const markdown = readFileSync(filePath, 'utf8');
  if (!markdown.startsWith('---')) {
    return emptyMetadata;
  }

  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return emptyMetadata;
  }

  try {
    const parsed = YAML.parse(match[1]) as Record<string, unknown> | null;
    const whenToUse = typeof parsed?.when_to_use === 'string' ? parsed.when_to_use.trim() : undefined;
    const signals = Array.isArray(parsed?.signals)
      ? parsed.signals
          .filter((signal): signal is string => typeof signal === 'string')
          .map(signal => signal.trim())
          .filter(Boolean)
      : [];

    return {
      whenToUse: whenToUse || undefined,
      signals,
    };
  } catch {
    return emptyMetadata;
  }
}

function applyOverrides(
  components: DomainPackComponent[],
  config: DomainConfig,
  component: DomainComponentKind,
  baseDir: string,
) {
  const byID = new Map(components.map(entry => [entry.id, entry]));
  const overrides = normalizeDomainConfig(config)[component] ?? {};

  for (const [id, override] of Object.entries(overrides)) {
    if (override === false) {
      byID.delete(id);
      continue;
    }

    if (!byID.has(id)) {
      continue;
    }

    const overridePath = resolveConfiguredPath(override.path, baseDir);
    byID.set(id, {
      id,
      path: overridePath,
      ...componentMetadata(overridePath),
    });
  }

  return [...byID.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function resolveDomainRoot(configDir: string, domain: string) {
  return join(configDir, 'your-legion', 'domains', domain);
}

function resolveBundledDomainRoot(domain: string) {
  const runtimeRoot = dirname(fileURLToPath(import.meta.url));
  const bundledRoot = join(runtimeRoot, 'domains', domain);

  return existsSync(bundledRoot) ? bundledRoot : join(runtimeRoot, '..', 'domains', domain);
}

function domainMarkdownListItems(markdown: string, heading: string) {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex(line => line.trim() === heading);
  if (headingIndex === -1) {
    return [];
  }

  const items: string[] = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (/^#+\s/.test(line) || /^[A-Z][A-Za-z ]+:$/.test(line.trim())) {
      break;
    }

    const match = line.match(/^\s*-\s+`([^`]+)`\s*$/);
    if (match) {
      items.push(match[1].trim());
    }
  }

  return items;
}

function componentIDFromDeclaredPath(kind: DomainComponentKind, relativePath: string) {
  if (kind === 'skills' && relativePath.endsWith('/SKILL.md')) {
    return basename(dirname(relativePath));
  }

  return basename(relativePath, '.md');
}

function declaredDomainComponents({
  descriptionPath,
  description,
  kind,
}: {
  descriptionPath?: string;
  description: string;
  kind: DomainComponentKind;
}) {
  if (!descriptionPath) {
    return [];
  }

  const domainRoot = dirname(descriptionPath);
  return domainMarkdownListItems(description, DOMAIN_COMPONENT_HEADINGS[kind])
    .filter(relativePath => relativePath.startsWith(`${kind}/`))
    .map(relativePath => ({
      id: componentIDFromDeclaredPath(kind, relativePath),
      path: join(domainRoot, relativePath),
    }))
    .filter(component => existsSync(component.path))
    .map(component => ({
      ...component,
      ...componentMetadata(component.path),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function truncateDescription(description: string) {
  const normalized = description.trim();
  if (normalized.length <= DOMAIN_DESCRIPTION_MAX_CHARS) {
    return {
      description: normalized,
      truncated: false,
    };
  }

  return {
    description: `${normalized.slice(0, DOMAIN_DESCRIPTION_MAX_CHARS).trimEnd()}\n[truncated]`,
    truncated: true,
  };
}

function resolveDomainDescription(root: string, bundledRoot: string) {
  const globalDescriptionPath = join(root, DOMAIN_DESCRIPTION_FILE);
  const bundledDescriptionPath = join(bundledRoot, DOMAIN_DESCRIPTION_FILE);
  const descriptionPath = existsSync(globalDescriptionPath)
    ? globalDescriptionPath
    : existsSync(bundledDescriptionPath)
      ? bundledDescriptionPath
      : undefined;
  if (!descriptionPath) {
    return undefined;
  }

  const rawDescription = readFileSync(descriptionPath, 'utf8');
  const { description, truncated } = truncateDescription(rawDescription);

  return {
    description,
    descriptionPath,
    descriptionTruncated: truncated,
  };
}

export function resolveDomainPacks({ configDir, configPath, domains }: ResolveDomainPacksOptions): DomainPack[] {
  const resolvedConfigDir = configDir ? resolve(configDir) : getOpenCodeConfigDir();
  const overrideBaseDir = configPath ? dirname(resolve(configPath)) : resolvedConfigDir;

  return Object.entries(domains)
    .map(([id, config]) => {
      const root = resolveDomainRoot(resolvedConfigDir, id);
      const bundledRoot = resolveBundledDomainRoot(id);
      const components = {} as Record<DomainComponentKind, DomainPackComponent[]>;
      const description = resolveDomainDescription(root, bundledRoot);
      if (!description) {
        return undefined;
      }

      for (const component of DOMAIN_COMPONENTS) {
        components[component] = applyOverrides(
          declaredDomainComponents({
            descriptionPath: description.descriptionPath,
            description: description.description,
            kind: component,
          }),
          config,
          component,
          overrideBaseDir,
        );
      }

      return {
        id,
        root,
        ...description,
        components,
      };
    })
    .filter((pack): pack is DomainPack => Boolean(pack))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function formatComponent(kind: DomainComponentKind, pack: DomainPack) {
  const components = pack.components[kind];
  if (components.length === 0) {
    return [];
  }

  const title = kind[0].toUpperCase() + kind.slice(1);
  return [
    `  ${title}:`,
    ...components.flatMap(component => {
      const lines = [`  - \`${pack.id}/${component.id}\` (Path: ${component.path})`];
      if (component.whenToUse) {
        lines.push(`    when_to_use: ${component.whenToUse}`);
      }
      if (component.signals.length > 0) {
        lines.push(`    signals: ${component.signals.join(', ')}`);
      }
      return lines;
    }),
  ];
}

export function countDomainPackComponents(pack: DomainPack) {
  return DOMAIN_COMPONENTS.reduce((total, component) => total + pack.components[component].length, 0);
}

export function buildDomainPromptSection(domainPacks: DomainPack[]) {
  if (domainPacks.length === 0) {
    return '';
  }

  const lines = [
    '## Domain Catalog',
    '',
    'Use the Domain Catalog like skill descriptions.',
    'Compare the task against the domain descriptions before delegation.',
    'Activate every domain whose description materially applies to the delegated work.',
    'A task may activate multiple domains when multiple descriptions materially apply.',
    'If no domain description clearly applies, use no-domain delegation: Active domains: none, Domain refs: none, Domain skills: none.',
    'Routing agents should pass Domain refs and Domain skills in the Task Context Envelope; target specialists should read the exact paths listed below.',
    'Avoid harness-level skill resolution for these entries unless the user explicitly asks for an external harness skill.',
    '',
    'Available domains:',
  ];

  for (const pack of domainPacks) {
    lines.push('', `### \`${pack.id}\``, `Root: ${pack.root}`, 'Description:', pack.description);

    if (pack.descriptionTruncated) {
      lines.push(`Description truncated at ${DOMAIN_DESCRIPTION_MAX_CHARS} characters.`);
    }

    if (countDomainPackComponents(pack) === 0) {
      lines.push(
        '  Warning: No domain components discovered. Add at least one workflow, decision, example, or skill before using this domain as active task context.',
      );
    }

    for (const component of DOMAIN_COMPONENTS) {
      lines.push(...formatComponent(component, pack));
    }
  }

  return lines.join('\n');
}
