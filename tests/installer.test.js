import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

function makeTempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))
}

test('installer writes global agent-providers.yaml and registers the plugin', async () => {
  const configDir = makeTempDir('your-legion-install')
  const sourceConfigPath = path.join(rootDir, 'agent-providers.yaml')
  const { installYourLegion } = await import('../src/install.ts')

  const result = installYourLegion({
    configDir,
    sourceConfigPath,
    now: new Date('2026-01-25T11:18:28.014Z'),
  })

  const agentConfigPath = path.join(configDir, 'agent-providers.yaml')
  const opencodeConfigPath = path.join(configDir, 'opencode.json')
  const opencodeConfig = JSON.parse(fs.readFileSync(opencodeConfigPath, 'utf8'))

  assert.equal(result.agentProviderConfigPath, agentConfigPath)
  assert.equal(result.agentProviderBackupPath, undefined)
  assert.equal(fs.readFileSync(agentConfigPath, 'utf8'), fs.readFileSync(sourceConfigPath, 'utf8'))
  assert.deepEqual(opencodeConfig.plugin, ['@whchi/your-legion'])
})

test('installer backs up an existing global agent-providers.yaml before overwriting', async () => {
  const configDir = makeTempDir('your-legion-install-backup')
  const sourceConfigPath = path.join(rootDir, 'agent-providers.yaml')
  const existingConfigPath = path.join(configDir, 'agent-providers.yaml')
  fs.writeFileSync(existingConfigPath, 'agents:\n  old: openai/old\n')
  const { installYourLegion } = await import('../src/install.ts')

  const result = installYourLegion({
    configDir,
    sourceConfigPath,
    now: new Date('2026-01-25T11:18:28.014Z'),
  })

  const backupPath = path.join(configDir, 'agent-providers.yaml.bak.2026-01-25T11-18-28-014Z')

  assert.equal(result.agentProviderBackupPath, backupPath)
  assert.equal(fs.readFileSync(backupPath, 'utf8'), 'agents:\n  old: openai/old\n')
  assert.equal(fs.readFileSync(existingConfigPath, 'utf8'), fs.readFileSync(sourceConfigPath, 'utf8'))
})

test('installer preserves existing plugin entries while registering Your Legion once', async () => {
  const configDir = makeTempDir('your-legion-install-plugin')
  fs.writeFileSync(
    path.join(configDir, 'opencode.json'),
    JSON.stringify({ plugin: ['opencode-wakatime', '@whchi/your-legion'] }, null, 2),
  )
  const { installYourLegion } = await import('../src/install.ts')

  installYourLegion({
    configDir,
    sourceConfigPath: path.join(rootDir, 'agent-providers.yaml'),
    now: new Date('2026-01-25T11:18:28.014Z'),
  })

  const opencodeConfig = JSON.parse(fs.readFileSync(path.join(configDir, 'opencode.json'), 'utf8'))

  assert.deepEqual(opencodeConfig.plugin, ['opencode-wakatime', '@whchi/your-legion'])
})

test('installer updates existing opencode.jsonc instead of creating opencode.json', async () => {
  const configDir = makeTempDir('your-legion-install-jsonc')
  fs.writeFileSync(path.join(configDir, 'opencode.jsonc'), '{\n  "plugin": ["opencode-wakatime"]\n}\n')
  const { installYourLegion } = await import('../src/install.ts')

  const result = installYourLegion({
    configDir,
    sourceConfigPath: path.join(rootDir, 'agent-providers.yaml'),
    now: new Date('2026-01-25T11:18:28.014Z'),
  })

  const opencodeConfig = JSON.parse(fs.readFileSync(path.join(configDir, 'opencode.jsonc'), 'utf8'))

  assert.equal(result.opencodeConfigPath, path.join(configDir, 'opencode.jsonc'))
  assert.equal(fs.existsSync(path.join(configDir, 'opencode.json')), false)
  assert.deepEqual(opencodeConfig.plugin, ['opencode-wakatime', '@whchi/your-legion'])
})

test('provider config resolution falls back to global opencode config dir', async () => {
  const projectDir = makeTempDir('your-legion-project')
  const configDir = makeTempDir('your-legion-global-config')
  fs.copyFileSync(path.join(rootDir, 'agent-providers.yaml'), path.join(configDir, 'agent-providers.yaml'))
  const { resolveAgentProviderConfigPath } = await import('../src/config/agent-providers.ts')

  const result = resolveAgentProviderConfigPath({
    rootDir: projectDir,
    configDir,
  })

  assert.equal(result, path.join(configDir, 'agent-providers.yaml'))
})

test('provider config resolution prefers project config over global config dir', async () => {
  const projectDir = makeTempDir('your-legion-project-local')
  const configDir = makeTempDir('your-legion-global-config-local')
  fs.writeFileSync(path.join(projectDir, 'agent-providers.yaml'), 'agents: {}\n')
  fs.writeFileSync(path.join(configDir, 'agent-providers.yaml'), 'agents: { global: true }\n')
  const { resolveAgentProviderConfigPath } = await import('../src/config/agent-providers.ts')

  const result = resolveAgentProviderConfigPath({
    rootDir: projectDir,
    configDir,
  })

  assert.equal(result, path.join(projectDir, 'agent-providers.yaml'))
})

test('build publishes the installer template under dist', () => {
  execFileSync('bun', ['run', 'build'], { cwd: rootDir, stdio: 'ignore' })

  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'agent-providers.yaml'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'agent-providers.yaml'), 'utf8'),
  )
})
