import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getOpenCodeConfigDir, loadLegionariesConfig, type LoadLegionariesConfigOptions } from '../config/legionaries';
import type { ResolvedDomainConfigMap, ResolvedLoopConfigMap } from '../shared/agent-types';
import {
  analyzeDomainUsageTraceEvents,
  type DomainUsageTraceEvent,
  evaluateDomainUsageScenarios,
  readDomainUsageTraceEvents,
} from './domain-usage-contract';
import { resolveDomainPacks, type DomainPack } from './domain-packs';

type DomainComponentKind = 'workflows' | 'decisions' | 'examples' | 'skills';

const DOMAIN_COMPONENTS: DomainComponentKind[] = ['workflows', 'decisions', 'examples', 'skills'];
const DOMAIN_COMPONENT_HEADINGS: Record<DomainComponentKind, string> = {
  workflows: 'Workflows:',
  decisions: 'Decisions:',
  examples: 'Examples:',
  skills: 'Skills:',
};

export type DoctorSectionStatus = 'PASS' | 'FAIL' | 'SKIPPED';

export type DoctorSection = {
  name: string;
  status: DoctorSectionStatus;
  failures: string[];
  warnings: string[];
  details?: string[];
};

export type YourLegionDoctorResult = {
  passed: boolean;
  sections: DoctorSection[];
};

export type RunYourLegionDoctorOptions = LoadLegionariesConfigOptions & {
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

  const fileName = relativePath.split('/').at(-1) ?? relativePath;
  return fileName.replace(/\.md$/, '');
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

export function diagnoseStaticDomainCatalog({
  configDir,
  domains,
}: {
  configDir?: string | URL;
  domains: ResolvedDomainConfigMap;
}): DoctorSection {
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

function traceSection(options: RunYourLegionDoctorOptions): DoctorSection {
  const worktree = resolve(toPath(options.rootDir));
  const events = readDomainUsageTraceEvents({
    worktree,
    configDir: options.configDir ? toPath(options.configDir) : undefined,
  });
  const failures = analyzeDomainUsageTraceEvents(events);

  return {
    name: 'Runtime trace diagnostics',
    status: failures.length > 0 ? 'FAIL' : 'PASS',
    failures,
    warnings: [],
  };
}

function increment(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function formatCounts(counts: Map<string, number>) {
  const entries = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
  return entries.length === 0 ? 'none' : entries.map(([key, count]) => `${key}=${count}`).join(', ');
}

function catalogRefs(domainPacks: DomainPack[]) {
  const refs = new Set<string>();
  const skills = new Set<string>();

  for (const pack of domainPacks) {
    for (const [kind, components] of Object.entries(pack.components)) {
      for (const component of components) {
        const ref = `${pack.id}/${component.id}`;
        if (kind === 'skills') {
          skills.add(ref);
        } else {
          refs.add(ref);
        }
      }
    }
  }

  return { refs, skills };
}

function formatDeclaredRead(declared: Map<string, number>, read: Map<string, number>) {
  const refs = new Set([...declared.keys(), ...read.keys()]);
  const entries = [...refs].sort((left, right) => left.localeCompare(right));
  return entries.length === 0
    ? 'none'
    : entries.map(ref => `${ref}=declared:${declared.get(ref) ?? 0}/read:${read.get(ref) ?? 0}`).join(', ');
}

function formatList(values: string[]) {
  return values.length === 0 ? 'none' : values.join(', ');
}

function formatActiveDomains(domains: DomainUsageTraceEvent['activeDomains']) {
  return domains.length === 0
    ? 'none'
    : domains.map(domain => (domain.responsibility ? `${domain.id}: ${domain.responsibility}` : domain.id)).join(', ');
}

function readsByDelegation(events: DomainUsageTraceEvent[]) {
  const reads = new Map<string, { refs: Set<string>; skills: Set<string> }>();
  const latestDelegationBySession = new Map<string, string>();

  for (const event of events) {
    if (event.event === 'delegation') {
      if (event.delegationID && event.sessionID) {
        latestDelegationBySession.set(event.sessionID, event.delegationID);
      }
      continue;
    }

    const delegationID =
      event.delegationID ?? (event.sessionID ? latestDelegationBySession.get(event.sessionID) : undefined);
    if (!delegationID) {
      continue;
    }

    const evidence = reads.get(delegationID) ?? {
      refs: new Set<string>(),
      skills: new Set<string>(),
    };
    for (const ref of event.domainRefs) {
      evidence.refs.add(ref);
    }
    for (const skill of event.domainSkills) {
      evidence.skills.add(skill);
    }
    reads.set(delegationID, evidence);
  }

  return reads;
}

function delegationSummaryDetails(events: DomainUsageTraceEvent[]) {
  const reads = readsByDelegation(events);
  const delegations = events.filter(event => event.event === 'delegation');

  return delegations.flatMap(event => {
    const delegationID = event.delegationID ?? 'missing-delegation-id';
    const evidence = event.delegationID ? reads.get(event.delegationID) : undefined;
    const details = [
      `Delegation ${delegationID}: target=${event.targetAgent ?? 'unknown'}; active=${formatActiveDomains(event.activeDomains)}`,
      `Delegation ${delegationID}: declared refs=${formatList(event.domainRefs)}; read refs=${formatList(evidence ? [...evidence.refs] : [])}`,
      `Delegation ${delegationID}: declared skills=${formatList(event.domainSkills)}; read skills=${formatList(evidence ? [...evidence.skills] : [])}`,
    ];
    if (event.warnings.length > 0) {
      details.push(`Delegation ${delegationID}: warnings=${formatList(event.warnings)}`);
    }

    return details;
  });
}

function unusedCatalogEntries(catalog: Set<string>, declared: Map<string, number>, read: Map<string, number>) {
  return [...catalog]
    .filter(ref => !declared.has(ref) && !read.has(ref))
    .sort((left, right) => left.localeCompare(right));
}

function warningCategory(diagnostic: string) {
  return diagnostic.match(/\[([^\]]+)\]/)?.[1] ?? 'domain-usage-warning';
}

function domainUsageStatsDetails(events: DomainUsageTraceEvent[], domainPacks: DomainPack[]) {
  const delegations = events.filter(event => event.event === 'delegation');
  const reads = events.filter(event => event.event === 'domain-read');
  const activeDomains = new Map<string, number>();
  const domainRefsDeclared = new Map<string, number>();
  const domainRefsRead = new Map<string, number>();
  const domainSkillsDeclared = new Map<string, number>();
  const domainSkillsRead = new Map<string, number>();
  const warningCategories = new Map<string, number>();

  for (const event of delegations) {
    for (const domain of event.activeDomains) {
      increment(activeDomains, domain.id);
    }
    for (const ref of event.domainRefs) {
      increment(domainRefsDeclared, ref);
    }
    for (const skill of event.domainSkills) {
      increment(domainSkillsDeclared, skill);
    }
  }

  for (const event of reads) {
    for (const ref of event.domainRefs) {
      increment(domainRefsRead, ref);
    }
    for (const skill of event.domainSkills) {
      increment(domainSkillsRead, skill);
    }
  }

  for (const diagnostic of analyzeDomainUsageTraceEvents(events)) {
    increment(warningCategories, warningCategory(diagnostic));
  }

  const catalog = catalogRefs(domainPacks);
  const unusedRefs =
    events.length === 0 ? [] : unusedCatalogEntries(catalog.refs, domainRefsDeclared, domainRefsRead);
  const unusedSkills =
    events.length === 0 ? [] : unusedCatalogEntries(catalog.skills, domainSkillsDeclared, domainSkillsRead);
  const noDomainDelegations = delegations.filter(
    event => event.activeDomains.length === 0 && event.domainRefs.length === 0 && event.domainSkills.length === 0,
  ).length;
  const latestDomainRead = reads.map(event => event.timestamp).sort().at(-1) ?? 'none';

  return [
    `Trace events: ${events.length} (${delegations.length} delegations, ${reads.length} domain reads)`,
    `No-domain delegations: ${noDomainDelegations}`,
    `Active domains: ${formatCounts(activeDomains)}`,
    `Domain refs declared/read: ${formatDeclaredRead(domainRefsDeclared, domainRefsRead)}`,
    `Domain skills declared/read: ${formatDeclaredRead(domainSkillsDeclared, domainSkillsRead)}`,
    `Latest domain read: ${latestDomainRead}`,
    `Warning categories: ${formatCounts(warningCategories)}`,
    `Unused catalog refs: ${events.length === 0 ? 'not evaluated (no trace events)' : unusedRefs.join(', ') || 'none'}`,
    `Unused catalog skills: ${events.length === 0 ? 'not evaluated (no trace events)' : unusedSkills.join(', ') || 'none'}`,
    ...delegationSummaryDetails(events),
  ];
}

function domainUsageStatsSection(options: RunYourLegionDoctorOptions, domainPacks: DomainPack[]): DoctorSection {
  const worktree = resolve(toPath(options.rootDir));
  const events = readDomainUsageTraceEvents({
    worktree,
    configDir: options.configDir ? toPath(options.configDir) : undefined,
  });

  return {
    name: 'Domain usage stats',
    status: 'PASS',
    failures: [],
    warnings: [],
    details: domainUsageStatsDetails(events, domainPacks),
  };
}

function loopCatalogSection({
  rootDir,
  loops,
  domainPacks,
}: {
  rootDir: string | URL;
  loops: ResolvedLoopConfigMap;
  domainPacks: DomainPack[];
}): DoctorSection {
  const failures: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];
  const worktree = resolve(toPath(rootDir));
  const catalog = catalogRefs(domainPacks);

  for (const [loopID, loop] of Object.entries(loops).sort(([left], [right]) => left.localeCompare(right))) {
    const agents = loop.agents ?? {};
    const maker = agents.maker ?? 'builder';
    const verifier = agents.verifier ?? 'verifier';
    details.push(`${loopID}: trigger=${loop.trigger.type}; inbox=${loop.inbox_path}; maker=${maker}; verifier=${verifier}`);

    if (!existsSync(join(worktree, loop.inbox_path))) {
      failures.push(`missing loop inbox: ${loopID} -> ${loop.inbox_path}`);
    }
    if (maker === verifier) {
      failures.push(`loop maker and verifier must be separate: ${loopID}`);
    }
    if (loop.verification.commands.length === 0) {
      failures.push(`loop has no verification commands: ${loopID}`);
    }
    for (const ref of loop.domain_refs ?? []) {
      if (!catalog.refs.has(ref)) {
        failures.push(`unknown loop domain ref: ${loopID} -> ${ref}`);
      }
    }
    for (const skill of loop.domain_skills ?? []) {
      if (!catalog.skills.has(skill)) {
        failures.push(`unknown loop domain skill: ${loopID} -> ${skill}`);
      }
    }
    if ((loop.connectors?.mode ?? 'manual') === 'manual') {
      warnings.push(`loop connector mode is manual: ${loopID}`);
    }
  }

  return {
    name: 'Loop catalog',
    status: failures.length > 0 ? 'FAIL' : 'PASS',
    failures,
    warnings,
    details,
  };
}

function loopRuntimeSection(options: RunYourLegionDoctorOptions, loops: ResolvedLoopConfigMap): DoctorSection {
  const events = readDomainUsageTraceEvents({
    worktree: resolve(toPath(options.rootDir)),
    configDir: options.configDir ? toPath(options.configDir) : undefined,
  });
  const failures: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];
  const loopDelegations = events.filter(
    event => (event.event === 'delegation' || event.event === 'loop-run-report') && event.loopID,
  );
  const loopRuns = new Map<
    string,
    {
      loopID: string;
      loopRunID: string;
      statuses: Set<string>;
      targets: Set<string>;
      verificationOutcomes: Set<string>;
      completionClaims: string[];
    }
  >();
  const verifierDelegations = new Set(
    loopDelegations.filter(event => event.targetAgent === 'verifier').map(event => event.loopID),
  );

  for (const event of loopDelegations) {
    const loopID = event.loopID;
    if (!loopID) {
      continue;
    }
    const loop = loops[loopID];
    if (!loop) {
      failures.push(`unknown loop evidence: ${loopID}`);
      continue;
    }

    const maker = loop.agents?.maker ?? 'builder';
    const verifier = loop.agents?.verifier ?? 'verifier';
    if (event.targetAgent === maker && !event.loopRunID && !verifierDelegations.has(loopID)) {
      failures.push(`loop maker delegation has no verifier evidence: ${loopID}`);
    }
    if (event.loopRunID) {
      const key = `${loopID}/${event.loopRunID}`;
      const run = loopRuns.get(key) ?? {
        loopID,
        loopRunID: event.loopRunID,
        statuses: new Set<string>(),
        targets: new Set<string>(),
        verificationOutcomes: new Set<string>(),
        completionClaims: [],
      };
      if (event.loopStatus) {
        run.statuses.add(event.loopStatus);
      }
      if (event.targetAgent) {
        run.targets.add(event.targetAgent);
      }
      if (event.verificationOutcome) {
        run.verificationOutcomes.add(event.verificationOutcome);
      }
      if (event.completionClaim) {
        run.completionClaims.push(event.completionClaim);
      }
      loopRuns.set(key, run);
    }
    details.push(
      `Loop ${loopID}: target=${event.targetAgent ?? 'unknown'}; run=${event.loopRunID ?? 'none'}; status=${event.loopStatus ?? 'none'}; expected verifier=${verifier}`,
    );
  }

  for (const run of [...loopRuns.values()].sort((left, right) =>
    `${left.loopID}/${left.loopRunID}`.localeCompare(`${right.loopID}/${right.loopRunID}`),
  )) {
    if (!loops[run.loopID]) {
      continue;
    }

    if (run.statuses.has('maker-complete') && !run.statuses.has('verifier-complete')) {
      failures.push(`loop run maker-complete has no verifier-complete: ${run.loopID}/${run.loopRunID}`);
    }
    if (run.statuses.has('verifier-complete') && !run.verificationOutcomes.has('passed')) {
      warnings.push(`loop run verifier-complete has no passed verification outcome: ${run.loopID}/${run.loopRunID}`);
    }
    if (run.statuses.has('blocked') || run.statuses.has('failed')) {
      warnings.push(`loop run requires human follow-up: ${run.loopID}/${run.loopRunID}`);
    }
    details.push(
      `Loop run ${run.loopID}/${run.loopRunID}: statuses=${formatList([...run.statuses])}; targets=${formatList([...run.targets])}; outcomes=${formatList([...run.verificationOutcomes])}; claim=${run.completionClaims.at(-1) ?? 'none'}`,
    );
  }

  if (loopDelegations.length === 0 && Object.keys(loops).length > 0) {
    warnings.push('no loop runtime evidence found yet');
  }

  return {
    name: 'Loop runtime evidence',
    status: failures.length > 0 ? 'FAIL' : 'PASS',
    failures,
    warnings,
    details,
  };
}

function scenarioSection(options: RunYourLegionDoctorOptions): DoctorSection {
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

export function runYourLegionDoctor(options: RunYourLegionDoctorOptions): YourLegionDoctorResult {
  const config = loadLegionariesConfig(options);
  const domainPacks = resolveDomainPacks({
    configDir: options.configDir ? toPath(options.configDir) : undefined,
    configPath: config.filePath,
    domains: config.domains,
  });
  const sections = [
    diagnoseStaticDomainCatalog({
      configDir: options.configDir,
      domains: config.domains,
    }),
    traceSection(options),
    domainUsageStatsSection(options, domainPacks),
    loopCatalogSection({
      rootDir: options.rootDir,
      loops: config.loops,
      domainPacks,
    }),
    loopRuntimeSection(options, config.loops),
    scenarioSection(options),
  ];

  return {
    passed: sections.every(section => section.status !== 'FAIL'),
    sections,
  };
}

export function doctorResultHash(result: YourLegionDoctorResult) {
  return createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0, 16);
}
