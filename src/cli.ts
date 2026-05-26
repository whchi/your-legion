#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, resolve } from 'node:path';

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
  evaluateDomainUsageScenarios,
  readDomainUsageTraceEvents,
} from './runtime/domain-usage-contract';
import { runYourLegionCheck } from './runtime/checks';

function printUsage() {
  console.log(`Usage:
  bunx @whchi/your-legion install [--config-dir <path>] [--domains <ids>] [--add-domains <ids>]
  bunx @whchi/your-legion create-domain <domain-id> [--config-dir <path>] [--components <ids>] [--enable]
  bunx @whchi/your-legion check [--worktree <path>] [--config-dir <path>] [--scenarios]
  bunx @whchi/your-legion trace [--worktree <path>] [--config-dir <path>] [--limit <n>]
  bunx @whchi/your-legion trace-check [--worktree <path>] [--config-dir <path>]
  bunx @whchi/your-legion domain-scenarios
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
  console.log(`Available bundled domains: ${AVAILABLE_DOMAIN_IDS.join(', ')} (default: coding)`);
  console.log(`Enabled domains: ${result.enabledDomains.join(', ')}`);
  process.exit(0);
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
  console.log('bunx @whchi/your-legion check --worktree .');
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

  for (const event of events) {
    console.log(JSON.stringify(event, null, 2));
  }
  process.exit(0);
}

function printCheckResult(result: ReturnType<typeof runYourLegionCheck>) {
  console.log('Your Legion check');
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
    console.log('Your Legion check passed');
  }
}

function checkSectionCounts(sections: ReturnType<typeof runYourLegionCheck>['sections']) {
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
      steps.add('Run the matching OpenCode prompt, then rerun check with the same --worktree value.');
    }
    if (/\[unknown-active-domain\]|\[unknown-domain-ref\]|\[unknown-domain-skill\]|unknown active domain|unknown domain ref|unknown domain skill/.test(message)) {
      steps.add('Use only enabled domain ids and catalog ids shown in the Domain Catalog.');
    }
  }

  return [...steps];
}

if (command === 'check') {
  const worktree = resolve(optionValue('--worktree') ?? process.cwd());
  const result = runYourLegionCheck({
    rootDir: worktree,
    configDir: optionValue('--config-dir'),
    includeScenarios: hasFlag('--scenarios'),
  });

  printCheckResult(result);
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
