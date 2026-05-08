#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { installYourLegion } from './install.ts'

function printUsage() {
  console.log('Usage: your-legion install')
}

const command = process.argv[2]

if (command !== 'install') {
  printUsage()
  process.exit(command ? 1 : 0)
}

const distDir = dirname(fileURLToPath(import.meta.url))
const sourceConfigPath = resolve(distDir, 'legionaries.yaml')
const result = installYourLegion({ sourceConfigPath })

console.log(`Wrote ${result.legionariesConfigPath}`)
if (result.legionariesBackupPath) {
  console.log(`Backed up existing config to ${result.legionariesBackupPath}`)
}
console.log(`Updated ${result.opencodeConfigPath}`)
