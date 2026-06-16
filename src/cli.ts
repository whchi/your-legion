#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, resolve } from 'node:path';
import YAML from 'yaml';

import {
  AVAILABLE_DOMAIN_IDS,
  createDomainPack,
  type DomainComponentDir,
  DOMAIN_COMPONENT_DIRS,
  installYourLegion,
} from './install';
import {
  analyzeDomainUsageTraceEvents,
  DOMAIN_USAGE_SCENARIOS,
  LOOP_USAGE_SCENARIOS,
  evaluateDomainUsageScenarios,
  readDomainUsageTraceEvents,
} from './runtime/domain-usage-contract';
import { runYourLegionDoctor } from './runtime/doctor';
import { resolveLegionariesConfigPath } from './config/legionaries';

function printUsage() {
  console.log(`Usage:
  bunx @whchi/your-legion install [--config-dir <path>] [--domains <ids>] [--add-domains <ids>]
  bunx @whchi/your-legion create-domain <domain-id> [--config-dir <path>] [--components <ids>] [--enable]
  bunx @whchi/your-legion create-loop <loop-id> [--worktree <path>] [--config-dir <path>] [--description <text>] [--objective <text>]
  bunx @whchi/your-legion loops [--config-dir <path>]
  bunx @whchi/your-legion doctor [--worktree <path>] [--config-dir <path>] [--scenarios] [--loop-scenarios]
  bunx @whchi/your-legion trace [--worktree <path>] [--config-dir <path>] [--limit <n>] [--summary]
  bunx @whchi/your-legion trace-check [--worktree <path>] [--config-dir <path>]
  bunx @whchi/your-legion domain-scenarios
  bunx @whchi/your-legion loop-scenarios
  bunx @whchi/your-legion domain-scenario-check [--worktree <path>] [--config-dir <path>]`);
}

function optionValue(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function csvOption(name: string) {
  return optionValue(name)
    ?.split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

function configPathFor(worktree: string) {
  return resolveLegionariesConfigPath({
    rootDir: worktree,
    configDir: optionValue('--config-dir'),
  });
}

const command = process.argv[2];

if (!command) {
  printUsage();
  process.exit(0);
}

if (command === 'install') {
  const distDir = dirname(fileURLToPath(import.meta.url));
  const distConfigPath = resolve(distDir, 'legionaries.yaml');
  const sourceConfigPath = existsSync(distConfigPath) ? distConfigPath : resolve(distDir, '..', 'legionaries.yaml');
  const domains = optionValue('--domains');
  const addDomains = optionValue('--add-domains');
  const result = installYourLegion({
    sourceConfigPath,
    configDir: optionValue('--config-dir'),
    enabledDomains: domains ? domains.split(',') : undefined,
    addDomains: addDomains ? addDomains.split(',') : undefined,
  });

  const actionLabel = {
    created: 'Created',
    preserved: 'Preserved',
    replaced: 'Replaced',
    updated: 'Updated',
  }[result.configAction];
  console.log(`${actionLabel} ${result.legionariesConfigPath}`);
  if (result.legionariesBackupPath) {
    console.log(`Backed up existing config to ${result.legionariesBackupPath}`);
  }
  console.log(`Updated ${result.opencodeConfigPath}`);
  printModelMap(result.legionariesConfigPath);
  console.log(`Available bundled domains: ${AVAILABLE_DOMAIN_IDS.join(', ')} (default: coding)`);
  console.log(`Enabled domains: ${result.enabledDomains.join(', ')}`);
  process.exit(0);
}

function printModelMap(configPath: string) {
  const parsed = YAML.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown> | null;
  const systemAgents = parsed?.system_agents;
  if (!systemAgents || typeof systemAgents !== 'object' || Array.isArray(systemAgents)) {
    return;
  }

  console.log('Model map:');
  for (const [name, config] of Object.entries(systemAgents)) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      continue;
    }
    const model = (config as Record<string, unknown>).model;
    if (typeof model === 'string') {
      console.log(`- ${name} -> ${model}`);
    }
  }
}

if (command === 'create-domain') {
  const domainID = process.argv[3];
  if (!domainID) {
    printUsage();
    process.exit(1);
  }

  const result = createDomainPack({
    domainID,
    configDir: optionValue('--config-dir'),
    components: csvOption('--components') as DomainComponentDir[] | undefined,
    enable: hasFlag('--enable'),
  });

  console.log(`Created domain ${result.domainID} at ${result.domainRootPath}`);
  console.log(`Edit DOMAIN.md: ${result.descriptionPath}`);
  console.log(
    `Components: ${
      result.componentPaths.length === 0
        ? 'none'
        : result.componentPaths.map(componentPath => basename(componentPath)).join(', ')
    }`,
  );
  console.log(`Available components: ${DOMAIN_COMPONENT_DIRS.join(', ')}`);
  if (result.enabled) {
    console.log(`Enabled domain ${result.domainID} in ${result.configDir}/legionaries.yaml`);
  } else {
    console.log('Enable it with:');
    console.log(result.enablementSnippet.trimEnd());
  }
  console.log('Authoring guide: docs/DOMAIN_PACK_AUTHORING.md');
  console.log('Verify after use:');
  console.log('bunx @whchi/your-legion doctor --worktree .');
  process.exit(0);
}

if (command === 'create-loop') {
  const loopID = process.argv[3];
  if (!loopID) {
    printUsage();
    process.exit(1);
  }

  const worktree = resolve(optionValue('--worktree') ?? process.cwd());
  const configPath = configPathFor(worktree);
  const parsed = YAML.parse(readFileSync(configPath, 'utf8')) as Record<string, any>;
  parsed.loops = parsed.loops ?? {};
  if (parsed.loops[loopID]) {
    console.error(`loop already exists: ${loopID}`);
    process.exit(1);
  }

  const inboxPath = `docs/legion-loops/${loopID}.md`;
  const absoluteInboxPath = join(worktree, inboxPath);
  if (existsSync(absoluteInboxPath)) {
    console.error(`loop inbox already exists: ${inboxPath}`);
    process.exit(1);
  }

  const description = optionValue('--description') ?? `${loopID} loop`;
  const objective = optionValue('--objective') ?? `Run the ${loopID} loop with maker/checker verification`;
  parsed.loops[loopID] = {
    description,
    objective,
    trigger: {
      type: 'manual',
    },
    inbox_path: inboxPath,
    active_domains: [],
    domain_refs: [],
    domain_skills: [],
    agents: {
      triage: 'planner',
      maker: 'builder',
      verifier: 'verifier',
    },
    worktree: {
      isolation: 'required',
    },
    verification: {
      commands: ['bun test'],
      completion: 'All configured verification commands pass and verifier reports no high or critical findings.',
    },
    connectors: {
      mode: 'manual',
      targets: [],
    },
  };

  writeFileSync(configPath, YAML.stringify(parsed));
  mkdirSync(dirname(absoluteInboxPath), { recursive: true });
  writeFileSync(
    absoluteInboxPath,
    `# ${description}

Objective: ${objective}

## Current State

- Status: not-started
- Last run: none

## Findings

- none

## Human Inbox

- none
`,
  );

  console.log(`Created loop ${loopID}`);
  console.log(`Updated config: ${configPath}`);
  console.log(`Created inbox: ${inboxPath}`);
  console.log('Verify after use:');
  console.log('bunx @whchi/your-legion doctor --worktree .');
  process.exit(0);
}

if (command === 'loops') {
  const configPath = configPathFor(process.cwd());
  const parsed = YAML.parse(readFileSync(configPath, 'utf8')) as Record<string, any>;
  const loops = parsed.loops && typeof parsed.loops === 'object' ? parsed.loops : {};
  const entries = Object.entries(loops);
  if (entries.length === 0) {
    console.log('No loops configured');
    process.exit(0);
  }
  for (const [loopID, loop] of entries) {
    const config = loop as Record<string, any>;
    console.log(`${loopID}`);
    console.log(`- Description: ${config.description ?? 'none'}`);
    console.log(`- Trigger: ${config.trigger?.type ?? 'manual'}`);
    console.log(`- Inbox: ${config.inbox_path ?? 'none'}`);
  }
  process.exit(0);
}

if (command === 'trace') {
  const worktree = resolve(optionValue('--worktree') ?? process.cwd());
  const limit = Number(optionValue('--limit') ?? '20');
  const events = readDomainUsageTraceEvents({
    worktree,
    configDir: optionValue('--config-dir'),
    limit: Number.isFinite(limit) ? limit : 20,
  });

  if (hasFlag('--summary')) {
    printTraceSummary(events);
    process.exit(0);
  }

  for (const event of events) {
    console.log(JSON.stringify(event, null, 2));
  }
  process.exit(0);
}

function printTraceSummary(events: ReturnType<typeof readDomainUsageTraceEvents>) {
  const readsByDelegation = new Map<string, { refs: Set<string>; skills: Set<string> }>();
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

    const reads = readsByDelegation.get(delegationID) ?? {
      refs: new Set<string>(),
      skills: new Set<string>(),
    };
    for (const ref of event.domainRefs) {
      reads.refs.add(ref);
    }
    for (const skill of event.domainSkills) {
      reads.skills.add(skill);
    }
    readsByDelegation.set(delegationID, reads);
  }

  const delegations = events.filter(event => event.event === 'delegation');
  if (delegations.length === 0) {
    console.log('No delegation events found');
    return;
  }

  for (const event of delegations) {
    const delegationID = event.delegationID ?? 'missing-delegation-id';
    const reads = event.delegationID ? readsByDelegation.get(event.delegationID) : undefined;

    console.log(`Delegation ${delegationID}`);
    console.log(`- Target: ${event.targetAgent ?? 'unknown'}`);
    console.log(`- Loop: ${event.loopID ?? 'none'}`);
    console.log(`- Active domains: ${formatActiveDomains(event.activeDomains)}`);
    console.log(`- Declared refs: ${formatList(event.domainRefs)}`);
    console.log(`- Read refs: ${formatList(reads ? [...reads.refs] : [])}`);
    console.log(`- Declared skills: ${formatList(event.domainSkills)}`);
    console.log(`- Read skills: ${formatList(reads ? [...reads.skills] : [])}`);
    console.log(`- Warnings: ${formatList(event.warnings)}`);
  }
}

function formatActiveDomains(domains: ReturnType<typeof readDomainUsageTraceEvents>[number]['activeDomains']) {
  if (domains.length === 0) {
    return 'none';
  }

  return domains.map(domain => (domain.responsibility ? `${domain.id}: ${domain.responsibility}` : domain.id)).join(', ');
}

function formatList(values: string[]) {
  return values.length === 0 ? 'none' : values.join(', ');
}

function printDoctorResult(result: ReturnType<typeof runYourLegionDoctor>) {
  console.log('Your Legion doctor');
  console.log('');

  for (const section of result.sections) {
    console.log(`${section.name}: ${section.status}`);
  }

  const failures = result.sections.flatMap(section => section.failures);
  const warnings = result.sections.flatMap(section => section.warnings);
  const sectionCounts = checkSectionCounts(result.sections);

  console.log('');
  console.log('Summary:');
  console.log(
    `- Sections: ${sectionCounts.passed} passed, ${sectionCounts.failed} failed, ${sectionCounts.skipped} skipped`,
  );
  console.log(`- Findings: ${failures.length} ${plural(failures.length, 'failure')}, ${warnings.length} ${plural(warnings.length, 'warning')}`);

  if (failures.length > 0) {
    console.log('');
    console.log('Failures:');
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
  }

  if (warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  const details = result.sections.filter(section => section.details?.length);
  if (details.length > 0) {
    console.log('');
    console.log('Details:');
    for (const section of details) {
      console.log(`${section.name}:`);
      for (const detail of section.details ?? []) {
        console.log(`- ${detail}`);
      }
    }
  }

  const nextSteps = checkNextSteps([...failures, ...warnings]);
  if (nextSteps.length > 0) {
    console.log('');
    console.log('Next steps:');
    for (const nextStep of nextSteps) {
      console.log(`- ${nextStep}`);
    }
  }

  if (result.passed) {
    console.log('');
    console.log('Your Legion doctor passed');
  }
}

function checkSectionCounts(sections: ReturnType<typeof runYourLegionDoctor>['sections']) {
  return {
    passed: sections.filter(section => section.status === 'PASS').length,
    failed: sections.filter(section => section.status === 'FAIL').length,
    skipped: sections.filter(section => section.status === 'SKIPPED').length,
  };
}

function plural(count: number, word: string) {
  return count === 1 ? word : `${word}s`;
}

function checkNextSteps(messages: string[]) {
  const steps = new Set<string>();

  for (const message of messages) {
    if (/missing DOMAIN\.md|invalid declared domain component path|missing declared domain component|undeclared domain component file/.test(message)) {
      steps.add("Inspect the enabled domain's DOMAIN.md and keep its component catalog in sync with real files.");
    }
    if (/missing declared domain component/.test(message)) {
      steps.add('Create the missing component file or remove the declaration from DOMAIN.md.');
    }
    if (/domain skill missing frontmatter/.test(message)) {
      steps.add('Add name and description frontmatter to the domain skill.');
    }
    if (/undeclared domain component file/.test(message)) {
      steps.add('List the file in DOMAIN.md or remove it if the domain should not expose it.');
    }
    if (/\[missing-domain-ref-read\]|\[missing-domain-skill-read\]|declared domain ref was not read|declared domain skill was not read|missing scenario evidence/.test(message)) {
      steps.add('Run the matching OpenCode prompt, then rerun doctor with the same --worktree value.');
    }
    if (/missing loop inbox/.test(message)) {
      steps.add('Create the loop inbox file or update loops.<id>.inbox_path to the repo-relative state file.');
    }
    if (/loop maker and verifier must be separate|loop maker delegation has no verifier evidence/.test(message)) {
      steps.add('Keep maker and verifier separate, then run the verifier delegation before claiming loop completion.');
    }
    if (/missing loop scenario evidence/.test(message)) {
      steps.add('Run the matching OpenCode prompt from loop-scenarios, then rerun doctor with --loop-scenarios.');
    }
    if (/\[unknown-active-domain\]|\[unknown-domain-ref\]|\[unknown-domain-skill\]|unknown active domain|unknown domain ref|unknown domain skill/.test(message)) {
      steps.add('Use only enabled domain ids and catalog ids shown in the Domain Catalog.');
    }
  }

  return [...steps];
}

if (command === 'doctor' || command === 'check') {
  if (command === 'check') {
    console.warn('`check` is deprecated; use `doctor`.');
  }
  const worktree = resolve(optionValue('--worktree') ?? process.cwd());
  const result = runYourLegionDoctor({
    rootDir: worktree,
    configDir: optionValue('--config-dir'),
    includeScenarios: hasFlag('--scenarios'),
    includeLoopScenarios: hasFlag('--loop-scenarios'),
  });

  printDoctorResult(result);
  process.exit(result.passed ? 0 : 1);
}

if (command === 'trace-check') {
  const worktree = resolve(optionValue('--worktree') ?? process.cwd());
  const events = readDomainUsageTraceEvents({
    worktree,
    configDir: optionValue('--config-dir'),
  });
  const warnings = analyzeDomainUsageTraceEvents(events);

  if (warnings.length > 0) {
    console.error(warnings.join('\n'));
    process.exit(1);
  }

  console.log('Domain usage trace check passed');
  process.exit(0);
}

if (command === 'domain-scenarios') {
  for (const scenario of DOMAIN_USAGE_SCENARIOS) {
    console.log(`## ${scenario.id}: ${scenario.title}`);
    console.log(scenario.prompt);
    console.log('');
  }
  process.exit(0);
}

if (command === 'loop-scenarios') {
  for (const scenario of LOOP_USAGE_SCENARIOS) {
    console.log(`## ${scenario.id}: ${scenario.title}`);
    console.log(scenario.prompt);
    console.log('');
  }
  process.exit(0);
}

if (command === 'domain-scenario-check') {
  const worktree = resolve(optionValue('--worktree') ?? process.cwd());
  const result = evaluateDomainUsageScenarios({
    worktree,
    configDir: optionValue('--config-dir'),
  });

  for (const scenario of result.results) {
    console.log(`${scenario.passed ? 'PASS' : 'FAIL'} ${scenario.id}`);
    for (const message of scenario.messages) {
      console.log(message);
    }
  }

  if (!result.passed) {
    process.exit(1);
  }

  console.log('Domain scenario check passed');
  process.exit(0);
}

printUsage();
process.exit(1);
