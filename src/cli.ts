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

function printUsage() {
  console.log(`Usage:
  bunx @whchi/your-legion install [--config-dir <path>] [--domains <ids>]
  bunx @whchi/your-legion create-domain <domain-id> [--config-dir <path>] [--components <ids>]
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
  const result = installYourLegion({
    sourceConfigPath,
    configDir: optionValue('--config-dir'),
    enabledDomains: domains ? domains.split(',') : undefined,
  });

  console.log(`Wrote ${result.legionariesConfigPath}`);
  if (result.legionariesBackupPath) {
    console.log(`Backed up existing config to ${result.legionariesBackupPath}`);
  }
  console.log(`Updated ${result.opencodeConfigPath}`);
  console.log(`Available domains: ${AVAILABLE_DOMAIN_IDS.join(', ')} (default: coding)`);
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
  });

  console.log(`Created domain ${result.domainID} at ${result.domainRootPath}`);
  console.log(
    `Components: ${
      result.componentPaths.length === 0
        ? 'none'
        : result.componentPaths.map(componentPath => basename(componentPath)).join(', ')
    }`,
  );
  console.log(`Available components: ${DOMAIN_COMPONENT_DIRS.join(', ')}`);
  console.log('Enable it with:');
  console.log(result.enablementSnippet.trimEnd());
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
