import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getOpenCodeConfigDir, loadLegionariesConfig, type LoadLegionariesConfigOptions } from '../config/legionaries';
import type { ResolvedDomainConfigMap } from '../shared/agent-types';
import { analyzeDomainUsageTraceEvents, evaluateDomainUsageScenarios, readDomainUsageTraceEvents } from './domain-usage-contract';

type DomainComponentKind = 'workflows' | 'decisions' | 'examples' | 'skills';

const DOMAIN_COMPONENTS: DomainComponentKind[] = ['workflows', 'decisions', 'examples', 'skills'];
const DOMAIN_COMPONENT_HEADINGS: Record<DomainComponentKind, string> = {
  workflows: 'Workflows:',
  decisions: 'Decisions:',
  examples: 'Examples:',
  skills: 'Skills:',
};

export type CheckSectionStatus = 'PASS' | 'FAIL' | 'SKIPPED';

export type CheckSection = {
  name: string;
  status: CheckSectionStatus;
  failures: string[];
  warnings: string[];
};

export type YourLegionCheckResult = {
  passed: boolean;
  sections: CheckSection[];
};

export type RunYourLegionCheckOptions = LoadLegionariesConfigOptions & {
  includeScenarios?: boolean;
};

function resolvedConfigDir(configDir?: string | URL) {
  return configDir ? resolve(toPath(configDir)) : getOpenCodeConfigDir();
}

function toPath(value: string | URL) {
  return value instanceof URL ? fileURLToPath(value) : value;
}

function bundledDomainRoot(domainID: string) {
  const runtimeRoot = dirname(fileURLToPath(import.meta.url));
  const bundledRoot = join(runtimeRoot, 'domains', domainID);

  return existsSync(bundledRoot) ? bundledRoot : join(runtimeRoot, '..', 'domains', domainID);
}

function domainRoot(configDir: string, domainID: string) {
  return join(configDir, 'your-legion', 'domains', domainID);
}

function domainDescriptionPath(configDir: string, domainID: string) {
  const globalPath = join(domainRoot(configDir, domainID), 'DOMAIN.md');
  if (existsSync(globalPath)) {
    return globalPath;
  }

  const bundledPath = join(bundledDomainRoot(domainID), 'DOMAIN.md');
  return existsSync(bundledPath) ? bundledPath : undefined;
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

function componentID(kind: DomainComponentKind, relativePath: string) {
  if (kind === 'skills' && relativePath.endsWith('/SKILL.md')) {
    return relativePath.split('/').at(-2) ?? relativePath;
  }

  return relativePath
    .split('/')
    .at(-1)!
    .replace(/\.md$/, '');
}

function displayDeclaredPath(domainID: string, relativePath: string) {
  return `${domainID}/${relativePath.replace(/\/SKILL\.md$/, '').replace(/\.md$/, '')}`;
}

function isValidDeclaredPath(kind: DomainComponentKind, relativePath: string) {
  if (relativePath.startsWith('/') || relativePath.includes('..') || relativePath.includes('\\')) {
    return false;
  }

  if (!relativePath.startsWith(`${kind}/`)) {
    return false;
  }

  return kind === 'skills' ? relativePath.endsWith('/SKILL.md') : relativePath.endsWith('.md');
}

function frontmatter(markdown: string) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }

  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map(line => line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map(match => [match[1], match[2].trim()]),
  );
}

function recursiveComponentFiles(root: string, kind: DomainComponentKind) {
  const componentRoot = join(root, kind);
  if (!existsSync(componentRoot)) {
    return [];
  }

  const files: string[] = [];
  function visit(dir: string) {
    for (const entry of readdirSync(dir)) {
      const entryPath = join(dir, entry);
      const stat = statSync(entryPath);
      if (stat.isDirectory()) {
        visit(entryPath);
        continue;
      }

      const relativePath = entryPath.slice(root.length + 1).split('/').join('/');
      if (kind === 'skills' ? relativePath.endsWith('/SKILL.md') : relativePath.endsWith('.md')) {
        files.push(relativePath);
      }
    }
  }

  visit(componentRoot);
  return files.sort();
}

function checkOneDomain({
  configDir,
  domainID,
}: {
  configDir: string;
  domainID: string;
}) {
  const failures: string[] = [];
  const warnings: string[] = [];
  const descriptionPath = domainDescriptionPath(configDir, domainID);

  if (!descriptionPath) {
    return {
      failures: [`missing DOMAIN.md for enabled domain: ${domainID}`],
      warnings,
    };
  }

  const root = dirname(descriptionPath);
  const markdown = readFileSync(descriptionPath, 'utf8');

  for (const kind of DOMAIN_COMPONENTS) {
    const declared = domainMarkdownListItems(markdown, DOMAIN_COMPONENT_HEADINGS[kind]);
    const declaredSet = new Set(declared);

    for (const relativePath of declared) {
      if (!isValidDeclaredPath(kind, relativePath)) {
        failures.push(`invalid declared domain component path: ${domainID}/${relativePath}`);
        continue;
      }

      const absolutePath = join(root, relativePath);
      if (!existsSync(absolutePath)) {
        failures.push(`missing declared domain component: ${displayDeclaredPath(domainID, relativePath)}`);
        continue;
      }

      if (kind === 'skills') {
        const metadata = frontmatter(readFileSync(absolutePath, 'utf8'));
        const ref = `${domainID}/${componentID(kind, relativePath)}`;
        if (!metadata.name) {
          failures.push(`domain skill missing frontmatter name: ${ref}`);
        }
        if (!metadata.description) {
          failures.push(`domain skill missing frontmatter description: ${ref}`);
        }
      }
    }

    for (const relativePath of recursiveComponentFiles(root, kind)) {
      if (!declaredSet.has(relativePath)) {
        warnings.push(`undeclared domain component file: ${displayDeclaredPath(domainID, relativePath)}`);
      }
    }
  }

  return { failures, warnings };
}

export function checkStaticDomainCatalog({
  configDir,
  domains,
}: {
  configDir?: string | URL;
  domains: ResolvedDomainConfigMap;
}): CheckSection {
  const failures: string[] = [];
  const warnings: string[] = [];
  const root = resolvedConfigDir(configDir);

  for (const domainID of Object.keys(domains).sort()) {
    const result = checkOneDomain({
      configDir: root,
      domainID,
    });
    failures.push(...result.failures);
    warnings.push(...result.warnings);
  }

  return {
    name: 'Static domain catalog',
    status: failures.length > 0 ? 'FAIL' : 'PASS',
    failures,
    warnings,
  };
}

function traceSection(options: RunYourLegionCheckOptions): CheckSection {
  const worktree = resolve(toPath(options.rootDir));
  const events = readDomainUsageTraceEvents({
    worktree,
    configDir: options.configDir ? toPath(options.configDir) : undefined,
  });
  const failures = analyzeDomainUsageTraceEvents(events);

  return {
    name: 'Runtime trace',
    status: failures.length > 0 ? 'FAIL' : 'PASS',
    failures,
    warnings: [],
  };
}

function scenarioSection(options: RunYourLegionCheckOptions): CheckSection {
  if (!options.includeScenarios) {
    return {
      name: 'Scenario evidence',
      status: 'SKIPPED',
      failures: [],
      warnings: ['Use --scenarios after running prompts from domain-scenarios.'],
    };
  }

  const result = evaluateDomainUsageScenarios({
    worktree: resolve(toPath(options.rootDir)),
    configDir: options.configDir ? toPath(options.configDir) : undefined,
  });
  const failures = result.results.flatMap(entry => entry.messages.map(message => `${entry.id}: ${message}`));

  return {
    name: 'Scenario evidence',
    status: result.passed ? 'PASS' : 'FAIL',
    failures,
    warnings: [],
  };
}

export function runYourLegionCheck(options: RunYourLegionCheckOptions): YourLegionCheckResult {
  const config = loadLegionariesConfig(options);
  const sections = [
    checkStaticDomainCatalog({
      configDir: options.configDir,
      domains: config.domains,
    }),
    traceSection(options),
    scenarioSection(options),
  ];

  return {
    passed: sections.every(section => section.status !== 'FAIL'),
    sections,
  };
}

export function checkResultHash(result: YourLegionCheckResult) {
  return createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0, 16);
}
