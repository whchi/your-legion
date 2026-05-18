import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const legionariesConfigPath = path.join(rootDir, 'legionaries.yaml')
const tempDir = path.join(rootDir, 'temp')

function systemAgentsFrom(config) {
  return config.system_agents ?? config.agents
}

function makeTempDir(t, name) {
  fs.mkdirSync(tempDir, { recursive: true })
  const dir = fs.mkdtempSync(path.join(tempDir, `${name}-`))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents)
}

test('enabled domains are resolved from the global convention directory', async (t) => {
  const projectDir = makeTempDir(t, 'domain-pack-project')
  const configDir = makeTempDir(t, 'domain-pack-config')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const domainRoot = path.join(configDir, 'your-legion', 'domains', 'marketing')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  writeFile(path.join(domainRoot, 'workflows', 'campaign-planning.md'), '# Campaign Planning\n')
  writeFile(path.join(domainRoot, 'decisions', 'brand-voice.md'), '# Brand Voice\n')
  writeFile(path.join(domainRoot, 'examples', 'launch-post.md'), '# Launch Post\n')
  writeFile(path.join(domainRoot, 'skills', 'campaign-brief', 'SKILL.md'), '# Campaign Brief\n')

  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgentsFrom(original),
      domains: {
        marketing: true,
      },
    }),
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir: projectDir,
    configDir,
    configPath,
  })

  assert.match(result.agent.orchestrator.prompt, /## Domain Packs/)
  assert.match(result.agent.orchestrator.prompt, /marketing/)
  assert.match(result.agent.orchestrator.prompt, /marketing\/campaign-brief/)
  assert.match(result.agent.orchestrator.prompt, /domains\/marketing\/skills\/campaign-brief\/SKILL\.md/)
  assert.match(result.agent.builder.prompt, /Use domain skills from the configured Domain Skill Index/)
  assert.match(result.agent.builder.prompt, /marketing\/campaign-brief/)
  assert.doesNotMatch(result.agent.builder.prompt, /use the harness skill tool for Your Legion domain skills/i)
})

test('domain pack prompt distinguishes enabled indexes from active task context', async (t) => {
  const projectDir = makeTempDir(t, 'domain-pack-active-context-project')
  const configDir = makeTempDir(t, 'domain-pack-active-context-config')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const marketingRoot = path.join(configDir, 'your-legion', 'domains', 'marketing')
  const codingRoot = path.join(configDir, 'your-legion', 'domains', 'coding')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  writeFile(path.join(marketingRoot, 'skills', 'campaign-brief', 'SKILL.md'), '# Campaign Brief\n')
  writeFile(path.join(codingRoot, 'skills', 'make-code-change', 'SKILL.md'), '# Make Code Change\n')

  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgentsFrom(original),
      domains: {
        coding: true,
        marketing: true,
      },
    }),
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir: projectDir,
    configDir,
    configPath,
  })

  assert.match(result.agent.orchestrator.prompt, /enabled domain packs are an index/i)
  assert.match(result.agent.orchestrator.prompt, /not automatically active task context/i)
  assert.match(result.agent.orchestrator.prompt, /Use the Task Context Envelope's Active domains/i)
  assert.match(result.agent.orchestrator.prompt, /coding\/make-code-change/)
  assert.match(result.agent.orchestrator.prompt, /marketing\/campaign-brief/)
  assert.doesNotMatch(result.agent.orchestrator.prompt, /registered as harness-level skills/i)
})

test('domain overrides merge with convention components by id', async (t) => {
  const projectDir = makeTempDir(t, 'domain-pack-override-project')
  const configDir = makeTempDir(t, 'domain-pack-override-config')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const baseRoot = path.join(configDir, 'your-legion')
  const domainRoot = path.join(baseRoot, 'domains', 'financial-analytics')
  const overrideDecisionPath = path.join(configDir, 'experiments', 'new-revenue-rules.md')
  const externalSkillPath = path.join(configDir, 'harness-skills', 'sql-query.md')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  writeFile(path.join(domainRoot, 'workflows', 'variance-review.md'), '# Variance Review\n')
  writeFile(path.join(domainRoot, 'decisions', 'revenue-recognition.md'), '# Old Revenue Rules\n')
  writeFile(path.join(domainRoot, 'examples', 'monthly-review.md'), '# Monthly Review\n')
  writeFile(path.join(domainRoot, 'skills', 'runway-analysis.md'), '# Runway Analysis\n')
  writeFile(overrideDecisionPath, '# New Revenue Rules\n')
  writeFile(externalSkillPath, '# SQL Query\n')

  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgentsFrom(original),
      domains: {
        'financial-analytics': {
          skills: {
            'common-data-query': {
              path: externalSkillPath,
            },
          },
          decisions: {
            'revenue-recognition': {
              path: overrideDecisionPath,
            },
          },
        },
      },
    }),
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir: projectDir,
    configDir,
    configPath,
  })

  assert.match(result.agent.orchestrator.prompt, /financial-analytics\/variance-review/)
  assert.match(result.agent.orchestrator.prompt, /financial-analytics\/runway-analysis/)
  assert.match(result.agent.orchestrator.prompt, /financial-analytics\/common-data-query/)
  assert.match(result.agent.orchestrator.prompt, /harness-skills\/sql-query\.md/)
  assert.match(result.agent.orchestrator.prompt, /experiments\/new-revenue-rules\.md/)
  assert.doesNotMatch(result.agent.orchestrator.prompt, /domains\/financial-analytics\/decisions\/revenue-recognition\.md/)
})

test('default coding domain resolves from bundled domain files', async () => {
  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir,
  })

  assert.match(result.agent.orchestrator.prompt, /## Domain Packs/)
  assert.match(result.agent.orchestrator.prompt, /`coding`/)
  assert.match(result.agent.orchestrator.prompt, /coding\/implementation-loop/)
  assert.match(result.agent.orchestrator.prompt, /coding\/engineering-guardrails/)
  assert.match(result.agent.orchestrator.prompt, /coding\/change-report/)
  assert.match(result.agent.orchestrator.prompt, /coding\/make-code-change/)
  assert.match(result.agent.builder.prompt, /Use domain skills from the configured Domain Skill Index/)
})
