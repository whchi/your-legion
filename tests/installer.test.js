import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const tempDir = path.join(rootDir, 'temp')

function makeTempDir(t, name) {
  fs.mkdirSync(tempDir, { recursive: true })
  const dir = fs.mkdtempSync(path.join(tempDir, `${name}-`))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('installer writes global legionaries.yaml and registers the plugin', async (t) => {
  const configDir = makeTempDir(t, 'your-legion-install')
  const sourceConfigPath = path.join(rootDir, 'legionaries.yaml')
  const { installYourLegion } = await import('../src/install.ts')

  const result = installYourLegion({
    configDir,
    sourceConfigPath,
    now: new Date('2026-01-25T11:18:28.014Z'),
  })

  const agentConfigPath = path.join(configDir, 'legionaries.yaml')
  const opencodeConfigPath = path.join(configDir, 'opencode.json')
  const opencodeConfig = JSON.parse(fs.readFileSync(opencodeConfigPath, 'utf8'))

  assert.equal(result.legionariesConfigPath, agentConfigPath)
  assert.equal(result.legionariesBackupPath, undefined)
  assert.equal(fs.readFileSync(agentConfigPath, 'utf8'), fs.readFileSync(sourceConfigPath, 'utf8'))
  assert.deepEqual(opencodeConfig.plugin, ['@whchi/your-legion'])
})

test('installer backs up an existing global legionaries.yaml before overwriting', async (t) => {
  const configDir = makeTempDir(t, 'your-legion-install-backup')
  const sourceConfigPath = path.join(rootDir, 'legionaries.yaml')
  const existingConfigPath = path.join(configDir, 'legionaries.yaml')
  fs.writeFileSync(existingConfigPath, 'agents:\n  old: openai/old\n')
  const { installYourLegion } = await import('../src/install.ts')

  const result = installYourLegion({
    configDir,
    sourceConfigPath,
    now: new Date('2026-01-25T11:18:28.014Z'),
  })

  const backupPath = path.join(configDir, 'legionaries.yaml.bak.2026-01-25T11-18-28-014Z')

  assert.equal(result.legionariesBackupPath, backupPath)
  assert.equal(fs.readFileSync(backupPath, 'utf8'), 'agents:\n  old: openai/old\n')
  assert.equal(fs.readFileSync(existingConfigPath, 'utf8'), fs.readFileSync(sourceConfigPath, 'utf8'))
})

test('installer preserves existing plugin entries while registering Your Legion once', async (t) => {
  const configDir = makeTempDir(t, 'your-legion-install-plugin')
  fs.writeFileSync(
    path.join(configDir, 'opencode.json'),
    JSON.stringify({ plugin: ['opencode-wakatime', '@whchi/your-legion'] }, null, 2),
  )
  const { installYourLegion } = await import('../src/install.ts')

  installYourLegion({
    configDir,
    sourceConfigPath: path.join(rootDir, 'legionaries.yaml'),
    now: new Date('2026-01-25T11:18:28.014Z'),
  })

  const opencodeConfig = JSON.parse(fs.readFileSync(path.join(configDir, 'opencode.json'), 'utf8'))

  assert.deepEqual(opencodeConfig.plugin, ['opencode-wakatime', '@whchi/your-legion'])
})

test('installer updates existing opencode.jsonc instead of creating opencode.json', async (t) => {
  const configDir = makeTempDir(t, 'your-legion-install-jsonc')
  fs.writeFileSync(path.join(configDir, 'opencode.jsonc'), '{\n  "plugin": ["opencode-wakatime"]\n}\n')
  const { installYourLegion } = await import('../src/install.ts')

  const result = installYourLegion({
    configDir,
    sourceConfigPath: path.join(rootDir, 'legionaries.yaml'),
    now: new Date('2026-01-25T11:18:28.014Z'),
  })

  const opencodeConfig = JSON.parse(fs.readFileSync(path.join(configDir, 'opencode.jsonc'), 'utf8'))

  assert.equal(result.opencodeConfigPath, path.join(configDir, 'opencode.jsonc'))
  assert.equal(fs.existsSync(path.join(configDir, 'opencode.json')), false)
  assert.deepEqual(opencodeConfig.plugin, ['opencode-wakatime', '@whchi/your-legion'])
})

test('legionaries config resolution falls back to global opencode config dir', async (t) => {
  const projectDir = makeTempDir(t, 'your-legion-project')
  const configDir = makeTempDir(t, 'your-legion-global-config')
  fs.copyFileSync(path.join(rootDir, 'legionaries.yaml'), path.join(configDir, 'legionaries.yaml'))
  const { resolveLegionariesConfigPath } = await import('../src/config/legionaries.ts')

  const result = resolveLegionariesConfigPath({
    rootDir: projectDir,
    configDir,
  })

  assert.equal(result, path.join(configDir, 'legionaries.yaml'))
})

test('legionaries config resolution prefers project config over global config dir', async (t) => {
  const projectDir = makeTempDir(t, 'your-legion-project-local')
  const configDir = makeTempDir(t, 'your-legion-global-config-local')
  fs.writeFileSync(path.join(projectDir, 'legionaries.yaml'), 'agents: {}\n')
  fs.writeFileSync(path.join(configDir, 'legionaries.yaml'), 'agents: { global: true }\n')
  const { resolveLegionariesConfigPath } = await import('../src/config/legionaries.ts')

  const result = resolveLegionariesConfigPath({
    rootDir: projectDir,
    configDir,
  })

  assert.equal(result, path.join(projectDir, 'legionaries.yaml'))
})

test('build publishes the installer template under dist', () => {
  fs.mkdirSync(path.join(rootDir, 'dist'), { recursive: true })
  execFileSync('bun', ['run', 'build'], { cwd: rootDir, stdio: 'ignore' })

  assert.equal(
    fs.readFileSync(path.join(rootDir, 'dist', 'legionaries.yaml'), 'utf8'),
    fs.readFileSync(path.join(rootDir, 'legionaries.yaml'), 'utf8'),
  )
})
