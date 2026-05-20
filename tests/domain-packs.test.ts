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

function domainMarkdownListItems(markdown, heading) {
  const lines = markdown.split(/\r?\n/)
  const headingIndex = lines.findIndex((line) => line.trim() === heading)
  if (headingIndex === -1) {
    return []
  }

  const items = []
  for (const line of lines.slice(headingIndex + 1)) {
    if (/^#+\s/.test(line) || /^[A-Z][A-Za-z ]+:$/.test(line.trim())) {
      break
    }
    const match = line.match(/^\s*-\s+(.+)$/)
    if (match) {
      items.push(match[1].trim())
    }
  }

  return items
}

test('enabled domains are resolved from global DOMAIN.md relative paths', async (t) => {
  const projectDir = makeTempDir(t, 'domain-pack-project')
  const configDir = makeTempDir(t, 'domain-pack-config')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const domainRoot = path.join(configDir, 'your-legion', 'domains', 'marketing')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  writeFile(
    path.join(domainRoot, 'DOMAIN.md'),
    `# Marketing

Use this domain when the task involves launch copy or market-facing messaging.

Workflows:
- \`workflows/campaign-planning.md\`

Decisions:
- \`decisions/brand-voice.md\`

Examples:
- \`examples/launch-post.md\`

Skills:
- \`skills/campaign-brief/SKILL.md\`
`,
  )
  writeFile(path.join(domainRoot, 'README.md'), '# Human README\n\nThis text is not routing context.\n')
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

  assert.match(result.agent.orchestrator.prompt, /## Domain Catalog/)
  assert.match(result.agent.orchestrator.prompt, /Use this domain when the task involves launch copy/)
  assert.doesNotMatch(result.agent.orchestrator.prompt, /This text is not routing context/)
  assert.match(result.agent.orchestrator.prompt, /marketing/)
  assert.match(result.agent.orchestrator.prompt, /marketing\/campaign-brief/)
  assert.match(result.agent.orchestrator.prompt, /domains\/marketing\/skills\/campaign-brief\/SKILL\.md/)
  assert.match(result.agent.builder.prompt, /Use domain skills from the configured Domain Catalog/)
  assert.match(result.agent.builder.prompt, /marketing\/campaign-brief/)
  assert.doesNotMatch(result.agent.builder.prompt, /use the harness skill tool for Your Legion domain skills/i)
})

test('domain catalog drives active-domain selection with no-domain fallback', async (t) => {
  const projectDir = makeTempDir(t, 'domain-pack-active-context-project')
  const configDir = makeTempDir(t, 'domain-pack-active-context-config')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const marketingRoot = path.join(configDir, 'your-legion', 'domains', 'marketing')
  const codingRoot = path.join(configDir, 'your-legion', 'domains', 'coding')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  writeFile(
    path.join(marketingRoot, 'DOMAIN.md'),
    `# Marketing

Use this domain when the task involves launch copy.

Skills:
- \`skills/campaign-brief/SKILL.md\`
`,
  )
  writeFile(
    path.join(codingRoot, 'DOMAIN.md'),
    `# Coding

Use this domain when the task involves code changes.

Skills:
- \`skills/make-code-change/SKILL.md\`
`,
  )
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

  assert.match(result.agent.orchestrator.prompt, /Use the Domain Catalog like skill descriptions/i)
  assert.match(result.agent.orchestrator.prompt, /Activate every domain whose description materially applies/i)
  assert.match(result.agent.orchestrator.prompt, /If no domain description clearly applies/i)
  assert.match(result.agent.orchestrator.prompt, /Active domains: none/i)
  assert.match(result.agent.orchestrator.prompt, /Domain refs: none/i)
  assert.match(result.agent.orchestrator.prompt, /Domain skills: none/i)
  assert.match(result.agent.orchestrator.prompt, /coding\/make-code-change/)
  assert.match(result.agent.orchestrator.prompt, /marketing\/campaign-brief/)
  assert.doesNotMatch(result.agent.orchestrator.prompt, /registered as harness-level skills/i)
})

test('domain descriptions resolve from DOMAIN.md only and prefer global over bundled', async (t) => {
  const projectDir = makeTempDir(t, 'domain-pack-description-project')
  const configDir = makeTempDir(t, 'domain-pack-description-config')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const domainRoot = path.join(configDir, 'your-legion', 'domains', 'coding')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  writeFile(
    path.join(domainRoot, 'DOMAIN.md'),
    '# Coding Override\n\nUse this domain when repo-local engineering implementation needs the local override.\n',
  )
  writeFile(
    path.join(domainRoot, 'README.md'),
    '# Coding README\n\nREADME must not be used as routing description.\n',
  )

  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgentsFrom(original),
      domains: {
        coding: true,
      },
    }),
  )

  const { resolveDomainPacks, buildDomainPromptSection } = await import(
    '../src/runtime/domain-packs.ts'
  )
  const [pack] = resolveDomainPacks({
    configDir,
    configPath,
    domains: { coding: true },
  })
  const prompt = buildDomainPromptSection([pack])

  assert.equal(pack.descriptionPath, path.join(domainRoot, 'DOMAIN.md'))
  assert.match(prompt, /repo-local engineering implementation needs the local override/)
  assert.doesNotMatch(prompt, /README must not be used/)
})

test('domain catalog truncates long descriptions deterministically', async (t) => {
  const projectDir = makeTempDir(t, 'domain-pack-long-description-project')
  const configDir = makeTempDir(t, 'domain-pack-long-description-config')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const domainRoot = path.join(configDir, 'your-legion', 'domains', 'long-domain')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))
  const longDescription = `# Long Domain\n\n${'Use this sentence for routing context. '.repeat(80)}`

  writeFile(path.join(domainRoot, 'DOMAIN.md'), longDescription)

  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgentsFrom(original),
      domains: {
        'long-domain': true,
      },
    }),
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir: projectDir,
    configDir,
    configPath,
  })

  assert.match(result.agent.orchestrator.prompt, /Description truncated at/)
  assert.match(result.agent.orchestrator.prompt, /\[truncated\]/)
})

test('domain catalog includes only component paths declared in DOMAIN.md', async (t) => {
  const projectDir = makeTempDir(t, 'domain-pack-declared-components-project')
  const configDir = makeTempDir(t, 'domain-pack-declared-components-config')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const domainRoot = path.join(configDir, 'your-legion', 'domains', 'marketing')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  writeFile(
    path.join(domainRoot, 'DOMAIN.md'),
    `# Marketing

Use this domain when the task involves launch copy.

Skills:
- \`skills/campaign-brief/SKILL.md\`
`,
  )
  writeFile(path.join(domainRoot, 'workflows', 'campaign-planning.md'), '# Campaign Planning\n')
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

  assert.match(result.agent.orchestrator.prompt, /marketing\/campaign-brief/)
  assert.doesNotMatch(result.agent.orchestrator.prompt, /marketing\/campaign-planning/)
  assert.doesNotMatch(result.agent.orchestrator.prompt, /workflows\/campaign-planning\.md/)
})

test('domain overrides merge with DOMAIN.md-declared components by id', async (t) => {
  const projectDir = makeTempDir(t, 'domain-pack-override-project')
  const configDir = makeTempDir(t, 'domain-pack-override-config')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const baseRoot = path.join(configDir, 'your-legion')
  const domainRoot = path.join(baseRoot, 'domains', 'financial-analytics')
  const overrideDecisionPath = path.join(configDir, 'experiments', 'new-revenue-rules.md')
  const externalSkillPath = path.join(configDir, 'harness-skills', 'sql-query.md')
  const unlistedSkillPath = path.join(configDir, 'harness-skills', 'unlisted-skill.md')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  writeFile(path.join(domainRoot, 'workflows', 'variance-review.md'), '# Variance Review\n')
  writeFile(path.join(domainRoot, 'decisions', 'revenue-recognition.md'), '# Old Revenue Rules\n')
  writeFile(path.join(domainRoot, 'examples', 'monthly-review.md'), '# Monthly Review\n')
  writeFile(path.join(domainRoot, 'skills', 'runway-analysis.md'), '# Runway Analysis\n')
  writeFile(path.join(domainRoot, 'skills', 'common-data-query', 'SKILL.md'), '# Common Data Query\n')
  writeFile(
    path.join(domainRoot, 'DOMAIN.md'),
    `# Financial Analytics

Use this domain when the task involves financial analytics.

Workflows:
- \`workflows/variance-review.md\`

Decisions:
- \`decisions/revenue-recognition.md\`

Examples:
- \`examples/monthly-review.md\`

Skills:
- \`skills/runway-analysis.md\`
- \`skills/common-data-query/SKILL.md\`
`,
  )
  writeFile(overrideDecisionPath, '# New Revenue Rules\n')
  writeFile(externalSkillPath, '# SQL Query\n')
  writeFile(unlistedSkillPath, '# Unlisted Skill\n')

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
            'unlisted-skill': {
              path: unlistedSkillPath,
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
  assert.doesNotMatch(result.agent.orchestrator.prompt, /financial-analytics\/unlisted-skill/)
  assert.doesNotMatch(result.agent.orchestrator.prompt, /harness-skills\/unlisted-skill\.md/)
  assert.match(result.agent.orchestrator.prompt, /experiments\/new-revenue-rules\.md/)
  assert.doesNotMatch(result.agent.orchestrator.prompt, /domains\/financial-analytics\/decisions\/revenue-recognition\.md/)
})

test('default coding domain resolves from bundled domain files', async () => {
  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir,
  })

  assert.match(result.agent.orchestrator.prompt, /## Domain Catalog/)
  assert.match(result.agent.orchestrator.prompt, /Use this domain when the task involves code/)
  assert.match(result.agent.orchestrator.prompt, /`coding`/)
  assert.match(result.agent.orchestrator.prompt, /coding\/implementation-loop/)
  assert.match(result.agent.orchestrator.prompt, /coding\/engineering-guardrails/)
  assert.match(result.agent.orchestrator.prompt, /coding\/change-report/)
  assert.match(result.agent.orchestrator.prompt, /coding\/make-code-change/)
  assert.match(result.agent.builder.prompt, /Use domain skills from the configured Domain Catalog/)
})

test('bundled coding marketing finance and accounting domains resolve when enabled', async (t) => {
  const projectDir = makeTempDir(t, 'domain-pack-bundled-all-project')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgentsFrom(original),
      domains: {
        coding: true,
        marketing: true,
        finance: true,
        accounting: true,
      },
    }),
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir: projectDir,
    configPath,
  })

  assert.match(result.agent.orchestrator.prompt, /coding\/make-code-change/)
  assert.match(result.agent.orchestrator.prompt, /marketing\/campaign-brief/)
  assert.match(result.agent.orchestrator.prompt, /finance\/financial-analysis/)
  assert.match(result.agent.orchestrator.prompt, /accounting\/apply-accounting-review/)
})

test('bundled DOMAIN.md lists domain-root relative component paths without arrows', () => {
  const domainRoot = path.join(rootDir, 'src', 'domains')
  const sectionExpectations = [
    ['Workflows:', 'workflows', /\.md$/],
    ['Decisions:', 'decisions', /\.md$/],
    ['Examples:', 'examples', /\.md$/],
    ['Skills:', 'skills', /\/SKILL\.md$/],
  ]

  for (const domainID of ['coding', 'marketing', 'finance', 'accounting']) {
    const markdown = fs.readFileSync(path.join(domainRoot, domainID, 'DOMAIN.md'), 'utf8')

    for (const [heading, componentKind, suffix] of sectionExpectations) {
      const items = domainMarkdownListItems(markdown, heading)
      assert.notEqual(items.length, 0, `${domainID} should document ${heading}`)

      for (const item of items) {
        assert.doesNotMatch(item, /->/, `${domainID} ${heading} should list direct paths: ${item}`)
        const match = item.match(/^`([^`]+)`$/)
        assert.ok(match, `${domainID} ${heading} item should be one backticked path: ${item}`)

        const relativePath = match[1]
        assert.equal(relativePath.startsWith(`${componentKind}/`), true, item)
        assert.match(relativePath, suffix, item)
        assert.equal(fs.existsSync(path.join(domainRoot, domainID, relativePath)), true, item)
      }
    }
  }
})

test('empty enabled domains are visible as quality warnings instead of fake templates', async (t) => {
  const projectDir = makeTempDir(t, 'domain-pack-empty-project')
  const configPath = path.join(projectDir, 'legionaries.yaml')
  const original = YAML.parse(fs.readFileSync(legionariesConfigPath, 'utf8'))

  fs.writeFileSync(
    configPath,
    YAML.stringify({
      system_agents: systemAgentsFrom(original),
      domains: {
        'empty-domain': true,
      },
    }),
  )

  const { buildEffectiveAgentConfig } = await import('../src/runtime/build-agent-config.ts')
  const result = await buildEffectiveAgentConfig({
    rootDir: projectDir,
    configPath,
  })

  assert.match(result.agent.orchestrator.prompt, /empty-domain/)
  assert.match(result.agent.orchestrator.prompt, /No domain components discovered/)
})
