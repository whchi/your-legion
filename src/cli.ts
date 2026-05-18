#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { createDomainPack, installYourLegion } from './install.ts'

function printUsage() {
  console.log(`Usage:
  your-legion install
  your-legion create-domain <domain-id> [--config-dir <path>]`)
}

function optionValue(name: string) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const command = process.argv[2]

if (!command) {
  printUsage()
  process.exit(0)
}

if (command === 'install') {
  const distDir = dirname(fileURLToPath(import.meta.url))
  const sourceConfigPath = resolve(distDir, 'legionaries.yaml')
  const result = installYourLegion({ sourceConfigPath })

  console.log(`Wrote ${result.legionariesConfigPath}`)
  if (result.legionariesBackupPath) {
    console.log(`Backed up existing config to ${result.legionariesBackupPath}`)
  }
  console.log(`Updated ${result.opencodeConfigPath}`)
  process.exit(0)
}

if (command === 'create-domain') {
  const domainID = process.argv[3]
  if (!domainID) {
    printUsage()
    process.exit(1)
  }

  const result = createDomainPack({
    domainID,
    configDir: optionValue('--config-dir'),
  })

  console.log(`Created domain ${result.domainID} at ${result.domainRootPath}`)
  console.log('Enable it with:')
  console.log(result.enablementSnippet.trimEnd())
  process.exit(0)
}

printUsage()
process.exit(1)
