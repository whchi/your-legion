import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

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

    byID.set(id, {
      id,
      path: resolveConfiguredPath(override.path, baseDir),
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

function resolveDomainDescription(root: string, bundledRoot: string, domain: string) {
  const globalDescriptionPath = join(root, DOMAIN_DESCRIPTION_FILE);
  const bundledDescriptionPath = join(bundledRoot, DOMAIN_DESCRIPTION_FILE);
  const descriptionPath = existsSync(globalDescriptionPath)
    ? globalDescriptionPath
    : existsSync(bundledDescriptionPath)
      ? bundledDescriptionPath
      : undefined;
  const rawDescription = descriptionPath ? readFileSync(descriptionPath, 'utf8') : domain;
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
      const description = resolveDomainDescription(root, bundledRoot, id);

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
    ...components.map(component => `  - \`${pack.id}/${component.id}\` (Path: ${component.path})`),
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
    'Use domain skills from the configured Domain Catalog by reading the exact path listed below.',
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
