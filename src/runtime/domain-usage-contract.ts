import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { getOpenCodeConfigDir } from '../config/legionaries';
import { countDomainPackComponents, type DomainPack } from './domain-packs';

const TRACE_VERSION = 1;
const TRACE_HASH_LENGTH = 16;

type EnvelopeField =
  | 'scenarioID'
  | 'loopID'
  | 'loopRunID'
  | 'loopStatus'
  | 'objective'
  | 'activeDomains'
  | 'domainRefs'
  | 'domainSkills'
  | 'contextRefs'
  | 'constraints'
  | 'expectedOutput'
  | 'verification'
  | 'completionClaim'
  | 'verificationCommands'
  | 'verificationOutcome';

const FIELD_NAMES: Record<string, EnvelopeField> = {
  scenario: 'scenarioID',
  loop: 'loopID',
  'loop run': 'loopRunID',
  'loop run id': 'loopRunID',
  'loop status': 'loopStatus',
  objective: 'objective',
  'active domains': 'activeDomains',
  'domain refs': 'domainRefs',
  'domain skills': 'domainSkills',
  'context refs': 'contextRefs',
  constraints: 'constraints',
  'expected output': 'expectedOutput',
  verification: 'verification',
  'completion claim': 'completionClaim',
  'verification commands': 'verificationCommands',
  'verification outcome': 'verificationOutcome',
};

export type LoopRunStatus = 'started' | 'maker-complete' | 'verifier-complete' | 'blocked' | 'failed';
export type VerificationOutcome = 'passed' | 'failed' | 'not-run' | 'unknown';

export type ActiveDomainUsage = {
  id: string;
  responsibility?: string;
};

export type TaskContextEnvelope = {
  scenarioID?: string;
  loopID?: string;
  loopRunID?: string;
  loopStatus?: LoopRunStatus;
  objective?: string;
  activeDomains: ActiveDomainUsage[];
  domainRefs: string[];
  domainSkills: string[];
  contextRefs: string[];
  constraints?: string;
  expectedOutput?: string;
  verification?: string;
  completionClaim?: string;
  verificationCommands: string[];
  verificationOutcome?: VerificationOutcome;
  rawFields: Partial<Record<EnvelopeField, string[]>>;
};

export type DomainUsageContractResult = {
  envelope: TaskContextEnvelope;
  warnings: string[];
};

export type DomainUsageTraceEvent = {
  version: number;
  contractVersion?: string;
  timestamp: string;
  worktree: string;
  sessionID?: string;
  delegationID?: string;
  scenarioID?: string;
  loopID?: string;
  loopRunID?: string;
  loopStatus?: LoopRunStatus;
  completionClaim?: string;
  verificationCommands?: string[];
  verificationOutcome?: VerificationOutcome;
  event: 'delegation' | 'domain-read' | 'loop-run-report';
  domainCatalogHash?: string;
  domainCatalogSize?: number;
  toolName?: string;
  toolArgsShape?: string[];
  targetAgent?: string;
  activeDomains: ActiveDomainUsage[];
  domainRefs: string[];
  domainSkills: string[];
  warnings: string[];
};

export type DomainUsageTraceOptions = {
  configDir?: string;
  worktree: string;
};

export type CreateDomainUsageTraceHooksOptions = DomainUsageTraceOptions & {
  domainPacks: DomainPack[];
};

export type DomainUsageScenario = {
  id: string;
  title: string;
  prompt: string;
  expectedActiveDomains: string[];
  expectedDomainRefs: string[];
  expectedDomainSkills: string[];
};

export type DomainUsageScenarioCheckResult = {
  id: string;
  title: string;
  passed: boolean;
  messages: string[];
};

function scenario({
  id,
  title,
  task,
  activeDomains,
  domainRefs = [],
  domainSkills,
}: {
  id: string;
  title: string;
  task: string;
  activeDomains: ActiveDomainUsage[];
  domainRefs?: string[];
  domainSkills: string[];
}): DomainUsageScenario {
  const activeDomainLines = activeDomains.map(domain => `- ${domain.id}: ${domain.responsibility}`).join('\n');
  const activeDomainEvidence = activeDomainLines || 'none';

  return {
    id,
    title,
    prompt: `Scenario: ${id}
${task}
When delegating, include "Scenario: ${id}" in the Task Context Envelope.
Expected delegation evidence:
Active domains:
${activeDomainEvidence}
Domain refs: ${domainRefs.length === 0 ? 'none' : domainRefs.join(', ')}
Domain skills: ${domainSkills.length === 0 ? 'none' : domainSkills.join(', ')}`,
    expectedActiveDomains: activeDomains.map(domain => domain.id),
    expectedDomainRefs: domainRefs,
    expectedDomainSkills: domainSkills,
  };
}

export const DOMAIN_USAGE_SCENARIOS: DomainUsageScenario[] = [
  scenario({
    id: 'no-domain-no-catalog',
    title: 'No domain when no catalog is configured',
    task: 'Ask Your Legion a simple repo-neutral question in a workspace with no enabled domains.',
    activeDomains: [],
    domainSkills: [],
  }),
  scenario({
    id: 'no-domain-ambiguous',
    title: 'No domain when no description clearly matches',
    task: 'Ask Your Legion to summarize a generic project note that does not clearly match any configured domain description.',
    activeDomains: [],
    domainSkills: [],
  }),
  scenario({
    id: 'coding-only',
    title: 'Coding only',
    task: 'Ask Your Legion to make a small code-coupled change and verify it.',
    activeDomains: [{ id: 'coding', responsibility: 'implement and verify the code change' }],
    domainRefs: ['coding/implementation-loop'],
    domainSkills: ['coding/make-code-change'],
  }),
  scenario({
    id: 'marketing-only',
    title: 'Marketing only',
    task: 'Ask Your Legion to draft launch copy only, with no code changes.',
    activeDomains: [{ id: 'marketing', responsibility: 'write launch copy' }],
    domainSkills: ['marketing/campaign-brief'],
  }),
  scenario({
    id: 'coding-marketing',
    title: 'Coding plus marketing',
    task: 'Ask Your Legion to implement a launch banner and write the matching launch copy.',
    activeDomains: [
      { id: 'coding', responsibility: 'implement launch UI' },
      { id: 'marketing', responsibility: 'write launch copy' },
    ],
    domainRefs: ['coding/implementation-loop'],
    domainSkills: ['coding/make-code-change', 'marketing/campaign-brief'],
  }),
  scenario({
    id: 'finance-only',
    title: 'Finance only',
    task: 'Ask Your Legion to analyze pricing, runway, or financial tradeoffs only, with no code changes.',
    activeDomains: [{ id: 'finance', responsibility: 'analyze financial tradeoffs' }],
    domainSkills: ['finance/financial-analysis'],
  }),
  scenario({
    id: 'accounting-only',
    title: 'Accounting only',
    task: 'Ask Your Legion to review accounting treatment or recognition rules only, with no code changes.',
    activeDomains: [{ id: 'accounting', responsibility: 'review accounting treatment' }],
    domainSkills: ['accounting/apply-accounting-review'],
  }),
  scenario({
    id: 'coding-finance',
    title: 'Coding plus finance',
    task: 'Ask Your Legion to implement a financial calculation or report and verify the code.',
    activeDomains: [
      { id: 'coding', responsibility: 'implement and verify the code change' },
      { id: 'finance', responsibility: 'define financial calculation rules' },
    ],
    domainRefs: ['coding/implementation-loop'],
    domainSkills: ['coding/make-code-change', 'finance/financial-analysis'],
  }),
  scenario({
    id: 'coding-accounting',
    title: 'Coding plus accounting',
    task: 'Ask Your Legion to implement accounting-related behavior and verify the code.',
    activeDomains: [
      { id: 'coding', responsibility: 'implement and verify the code change' },
      { id: 'accounting', responsibility: 'define accounting treatment rules' },
    ],
    domainRefs: ['coding/implementation-loop'],
    domainSkills: ['coding/make-code-change', 'accounting/apply-accounting-review'],
  }),
  scenario({
    id: 'accounting-finance',
    title: 'Accounting plus finance',
    task: 'Ask Your Legion to compare accounting treatment with financial analysis, without code changes.',
    activeDomains: [
      { id: 'accounting', responsibility: 'review accounting treatment' },
      { id: 'finance', responsibility: 'analyze financial impact' },
    ],
    domainSkills: ['accounting/apply-accounting-review', 'finance/financial-analysis'],
  }),
  scenario({
    id: 'finance-marketing',
    title: 'Finance plus marketing',
    task: 'Ask Your Legion to write market-facing copy that respects financial constraints or pricing strategy.',
    activeDomains: [
      { id: 'finance', responsibility: 'define financial constraints' },
      { id: 'marketing', responsibility: 'write market-facing copy' },
    ],
    domainSkills: ['finance/financial-analysis', 'marketing/campaign-brief'],
  }),
];

function cleanLine(line: string) {
  return line
    .trim()
    .replace(/^[-*]\s*/, '')
    .trim();
}

function cleanToken(value: string) {
  return value.trim().replace(/^`|`$/g, '').trim();
}

function splitTokens(lines: string[] | undefined) {
  if (!lines?.length) {
    return [];
  }

  return lines
    .flatMap(line => cleanLine(line).split(','))
    .map(cleanToken)
    .filter(token => token && token.toLowerCase() !== 'none');
}

function parseActiveDomains(lines: string[] | undefined): ActiveDomainUsage[] {
  return splitTokens(lines).map(entry => {
    const separator = entry.indexOf(':');
    if (separator === -1) {
      return { id: entry };
    }

    const id = entry.slice(0, separator).trim();
    const responsibility = entry.slice(separator + 1).trim();
    return responsibility ? { id, responsibility } : { id };
  });
}

const LOOP_RUN_STATUSES = new Set<LoopRunStatus>(['started', 'maker-complete', 'verifier-complete', 'blocked', 'failed']);
const VERIFICATION_OUTCOMES = new Set<VerificationOutcome>(['passed', 'failed', 'not-run', 'unknown']);

function parseLoopStatus(lines: string[] | undefined): LoopRunStatus | undefined {
  const value = splitTokens(lines)[0];
  return value && LOOP_RUN_STATUSES.has(value as LoopRunStatus) ? (value as LoopRunStatus) : undefined;
}

function parseVerificationOutcome(lines: string[] | undefined): VerificationOutcome | undefined {
  const value = splitTokens(lines)[0];
  return value && VERIFICATION_OUTCOMES.has(value as VerificationOutcome) ? (value as VerificationOutcome) : undefined;
}

export function parseTaskContextEnvelope(text: string): TaskContextEnvelope {
  const rawFields: Partial<Record<EnvelopeField, string[]>> = {};
  let currentField: EnvelopeField | undefined;

  for (const line of text.split(/\r?\n/)) {
    const fieldMatch = line.match(/^\s*(?:[-*]\s*)?([A-Za-z][A-Za-z ]+):\s*(.*)$/);

    if (fieldMatch) {
      const field = FIELD_NAMES[fieldMatch[1].trim().toLowerCase()];
      if (field) {
        currentField = field;
        rawFields[field] = rawFields[field] ?? [];

        if (fieldMatch[2].trim()) {
          rawFields[field]?.push(fieldMatch[2].trim());
        }
        continue;
      }
    }

    if (!currentField || !line.trim()) {
      continue;
    }

    rawFields[currentField] = rawFields[currentField] ?? [];
    rawFields[currentField]?.push(line);
  }

  return {
    scenarioID: splitTokens(rawFields.scenarioID).join(', ') || undefined,
    loopID: splitTokens(rawFields.loopID).join(', ') || undefined,
    loopRunID: splitTokens(rawFields.loopRunID).join(', ') || undefined,
    loopStatus: parseLoopStatus(rawFields.loopStatus),
    objective: splitTokens(rawFields.objective).join(', ') || undefined,
    activeDomains: parseActiveDomains(rawFields.activeDomains),
    domainRefs: splitTokens(rawFields.domainRefs),
    domainSkills: splitTokens(rawFields.domainSkills),
    contextRefs: splitTokens(rawFields.contextRefs),
    constraints: splitTokens(rawFields.constraints).join(', ') || undefined,
    expectedOutput: splitTokens(rawFields.expectedOutput).join(', ') || undefined,
    verification: splitTokens(rawFields.verification).join(', ') || undefined,
    completionClaim: splitTokens(rawFields.completionClaim).join(', ') || undefined,
    verificationCommands: splitTokens(rawFields.verificationCommands),
    verificationOutcome: parseVerificationOutcome(rawFields.verificationOutcome),
    rawFields,
  };
}

function domainIndex(domainPacks: DomainPack[]) {
  const domains = new Set<string>();
  const refs = new Set<string>();
  const skills = new Set<string>();
  const paths = new Map<string, { ref: string; isSkill: boolean }>();
  const componentCounts = new Map<string, number>();

  for (const pack of domainPacks) {
    domains.add(pack.id);
    componentCounts.set(pack.id, countDomainPackComponents(pack));

    for (const [kind, components] of Object.entries(pack.components)) {
      for (const component of components) {
        const ref = `${pack.id}/${component.id}`;
        refs.add(ref);
        paths.set(resolve(component.path), {
          ref,
          isSkill: kind === 'skills',
        });

        if (kind === 'skills') {
          skills.add(ref);
        }
      }
    }
  }

  return { domains, refs, skills, paths, componentCounts };
}

export function validateDomainUsageContract(
  envelope: TaskContextEnvelope,
  domainPacks: DomainPack[],
): DomainUsageContractResult {
  const warnings: string[] = [];
  const index = domainIndex(domainPacks);

  if (envelope.rawFields.activeDomains === undefined) {
    warnings.push('missing active domains: use a domain-id: responsibility entry or none');
  }

  for (const activeDomain of envelope.activeDomains) {
    if (!index.domains.has(activeDomain.id)) {
      warnings.push(`unknown active domain: ${activeDomain.id}`);
    } else if (index.componentCounts.get(activeDomain.id) === 0) {
      warnings.push(`active domain has no discovered components: ${activeDomain.id}`);
    }

    if (!activeDomain.responsibility) {
      warnings.push(`active domain must include responsibility: ${activeDomain.id}`);
    }
  }

  for (const domainRef of envelope.domainRefs) {
    if (!index.refs.has(domainRef)) {
      warnings.push(`unknown domain ref: ${domainRef}`);
    }
  }

  for (const domainSkill of envelope.domainSkills) {
    if (!index.skills.has(domainSkill)) {
      warnings.push(`unknown domain skill: ${domainSkill}`);
    }
  }

  return { envelope, warnings };
}

export function getDomainUsageTracePath({ configDir = getOpenCodeConfigDir(), worktree }: DomainUsageTraceOptions) {
  const hash = createHash('sha256').update(resolve(worktree)).digest('hex').slice(0, TRACE_HASH_LENGTH);

  return join(configDir, 'your-legion', 'traces', `${hash}.jsonl`);
}

export function appendDomainUsageTraceEvent({
  configDir,
  worktree,
  event,
}: DomainUsageTraceOptions & { event: DomainUsageTraceEvent }) {
  const tracePath = getDomainUsageTracePath({ configDir, worktree });
  mkdirSync(dirname(tracePath), { recursive: true });
  writeFileSync(tracePath, `${JSON.stringify(event)}\n`, { flag: 'a' });
}

export function readDomainUsageTraceEvents({
  configDir,
  worktree,
  limit,
}: DomainUsageTraceOptions & { limit?: number }) {
  const tracePath = getDomainUsageTracePath({ configDir, worktree });
  if (!existsSync(tracePath)) {
    return [];
  }

  const events = readFileSync(tracePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line) as DomainUsageTraceEvent);

  return limit === undefined ? events : events.slice(-limit);
}

function sorted(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function hasSameValues(actual: string[], expected: string[]) {
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

function includesAll(actual: string[], expected: string[]) {
  const actualSet = new Set(actual);
  return expected.every(value => actualSet.has(value));
}

export function evaluateDomainUsageScenarios(options: DomainUsageTraceOptions) {
  const events = readDomainUsageTraceEvents(options);
  const readsByDelegation = readEvidenceByDelegation(events);
  const results = DOMAIN_USAGE_SCENARIOS.map((scenario): DomainUsageScenarioCheckResult => {
    const event = events.find(candidate => {
      if (candidate.event !== 'delegation' || candidate.scenarioID !== scenario.id) {
        return false;
      }

      return (
        candidate.warnings.length === 0 &&
        hasSameValues(
          candidate.activeDomains.map(domain => domain.id),
          scenario.expectedActiveDomains,
        ) &&
        includesAll(candidate.domainRefs, scenario.expectedDomainRefs) &&
        includesAll(candidate.domainSkills, scenario.expectedDomainSkills)
      );
    });
    const messages: string[] = [];

    if (event && !event.delegationID && (scenario.expectedDomainRefs.length > 0 || scenario.expectedDomainSkills.length > 0)) {
      messages.push(`missing scenario delegation id: ${scenario.id}`);
    }

    if (event?.delegationID) {
      const reads = readsByDelegation.get(event.delegationID);
      for (const domainRef of scenario.expectedDomainRefs) {
        if (!reads?.refs.has(domainRef)) {
          messages.push(`missing scenario read evidence: ${domainRef}`);
        }
      }
      for (const domainSkill of scenario.expectedDomainSkills) {
        if (!reads?.skills.has(domainSkill)) {
          messages.push(`missing scenario read evidence: ${domainSkill}`);
        }
      }
    }

    return {
      id: scenario.id,
      title: scenario.title,
      passed: Boolean(event) && messages.length === 0,
      messages: event ? messages : [`missing scenario evidence: ${scenario.id}`],
    };
  });

  return {
    passed: results.every(result => result.passed),
    results,
  };
}

function extractSessionID(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const record = input as Record<string, unknown>;
  const direct = record.sessionID ?? record.sessionId;
  if (typeof direct === 'string') {
    return direct;
  }

  const properties = record.properties;
  if (properties && typeof properties === 'object') {
    const propertyRecord = properties as Record<string, unknown>;
    const propertySessionID = propertyRecord.sessionID ?? propertyRecord.sessionId;
    if (typeof propertySessionID === 'string') {
      return propertySessionID;
    }
  }

  return undefined;
}

function extractToolName(input: unknown) {
  if (!input || typeof input !== 'object') {
    return undefined;
  }

  const tool = (input as Record<string, unknown>).tool;
  return typeof tool === 'string' ? tool : undefined;
}

function extractArgs(output: unknown) {
  if (!output || typeof output !== 'object') {
    return {};
  }

  const args = (output as Record<string, unknown>).args;
  return args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
}

function stringArg(args: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = args[name];
    if (typeof value === 'string') {
      return value;
    }
  }

  return undefined;
}

function extractText(input: unknown): string {
  const fragments: string[] = [];
  const seen = new Set<unknown>();

  function visit(value: unknown) {
    if (typeof value === 'string') {
      fragments.push(value);
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) {
      return;
    }

    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    for (const item of Object.values(value as Record<string, unknown>)) {
      visit(item);
    }
  }

  visit(input);
  return fragments.join('\n');
}

function extractLoopRunReportText(input: unknown) {
  const text = extractText(input);
  const marker = 'Loop Run Report:';
  const markerIndex = text.lastIndexOf(marker);
  if (markerIndex === -1) {
    return '';
  }

  return text.slice(markerIndex);
}

function createTraceEvent(
  options: CreateDomainUsageTraceHooksOptions,
  event: Omit<DomainUsageTraceEvent, 'version' | 'timestamp' | 'worktree'>,
): DomainUsageTraceEvent {
  return {
    version: TRACE_VERSION,
    contractVersion: `domain-usage-v${TRACE_VERSION}`,
    timestamp: new Date().toISOString(),
    worktree: options.worktree,
    domainCatalogHash: domainCatalogHash(options.domainPacks),
    domainCatalogSize: options.domainPacks.length,
    ...event,
  };
}

function domainCatalogHash(domainPacks: DomainPack[]) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        domainPacks.map(pack => ({
          id: pack.id,
          descriptionPath: pack.descriptionPath,
          components: pack.components,
        })),
      ),
    )
    .digest('hex')
    .slice(0, TRACE_HASH_LENGTH);
}

function delegationIDFor({
  sessionID,
  targetAgent,
  scenarioID,
  envelope,
}: {
  sessionID?: string;
  targetAgent?: string;
  scenarioID?: string;
  envelope: TaskContextEnvelope;
}) {
  const hash = createHash('sha256')
    .update(
      JSON.stringify({
        sessionID,
        targetAgent,
        scenarioID,
        loopID: envelope.loopID,
        loopRunID: envelope.loopRunID,
        loopStatus: envelope.loopStatus,
        objective: envelope.objective,
        activeDomains: envelope.activeDomains,
        domainRefs: envelope.domainRefs,
        domainSkills: envelope.domainSkills,
        contextRefs: envelope.contextRefs,
      }),
    )
    .digest('hex')
    .slice(0, TRACE_HASH_LENGTH);

  return `del_${hash}`;
}

function readEvidenceByDelegation(events: DomainUsageTraceEvent[]) {
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
    for (const domainRef of event.domainRefs) {
      reads.refs.add(domainRef);
    }
    for (const domainSkill of event.domainSkills) {
      reads.skills.add(domainSkill);
    }
    readsByDelegation.set(delegationID, reads);
  }

  return readsByDelegation;
}

export function analyzeDomainUsageTraceEvents(events: DomainUsageTraceEvent[]) {
  const diagnostics = events.flatMap(event =>
    event.warnings.map(warning => formatDomainUsageDiagnostic(event.timestamp, event.event, warning)),
  );
  const readsByDelegation = readEvidenceByDelegation(events);

  for (const event of events) {
    if (event.event !== 'delegation') {
      continue;
    }

    const delegationID = event.delegationID;
    const reads = delegationID ? readsByDelegation.get(delegationID) : undefined;
    for (const domainRef of event.domainRefs) {
      if (!reads?.refs.has(domainRef)) {
        diagnostics.push(
          formatDomainUsageDiagnostic(
            event.timestamp,
            'delegation',
            `declared domain ref was not read: ${domainRef}`,
          ),
        );
      }
    }
    for (const domainSkill of event.domainSkills) {
      if (!reads?.skills.has(domainSkill)) {
        diagnostics.push(
          formatDomainUsageDiagnostic(
            event.timestamp,
            'delegation',
            `declared domain skill was not read: ${domainSkill}`,
          ),
        );
      }
    }
  }

  return diagnostics;
}

function domainUsageDiagnosticCategory(message: string) {
  if (/missing active domains/i.test(message)) {
    return 'missing-active-domains';
  }
  if (/unknown active domain/i.test(message)) {
    return 'unknown-active-domain';
  }
  if (/active domain has no discovered components/i.test(message)) {
    return 'empty-active-domain';
  }
  if (/active domain must include responsibility/i.test(message)) {
    return 'missing-domain-responsibility';
  }
  if (/unknown domain ref/i.test(message)) {
    return 'unknown-domain-ref';
  }
  if (/unknown domain skill/i.test(message)) {
    return 'unknown-domain-skill';
  }
  if (/declared domain ref was not read/i.test(message)) {
    return 'missing-domain-ref-read';
  }
  if (/declared domain skill was not read/i.test(message)) {
    return 'missing-domain-skill-read';
  }

  return 'domain-usage-warning';
}

function formatDomainUsageDiagnostic(
  timestamp: string,
  event: DomainUsageTraceEvent['event'],
  message: string,
) {
  return `${timestamp} ${event} [${domainUsageDiagnosticCategory(message)}]: ${message}`;
}

function findDomainComponentByPath(domainPacks: DomainPack[], filePath: string) {
  const index = domainIndex(domainPacks);
  return index.paths.get(resolve(filePath));
}

export function createDomainUsageTraceHooks(options: CreateDomainUsageTraceHooksOptions) {
  const latestDelegationBySession = new Map<string, string>();

  function write(event: DomainUsageTraceEvent) {
    appendDomainUsageTraceEvent({
      configDir: options.configDir,
      worktree: options.worktree,
      event,
    });
  }

  return {
    async 'tool.execute.before'(input: unknown, output: unknown) {
      if (extractToolName(input) !== 'task') {
        return;
      }

      const args = extractArgs(output);
      const prompt = stringArg(args, ['prompt', 'description']);
      if (!prompt) {
        return;
      }

      const envelope = parseTaskContextEnvelope(prompt);
      const result = validateDomainUsageContract(envelope, options.domainPacks);
      const sessionID = extractSessionID(input);
      const targetAgent = stringArg(args, ['subagent_type', 'agent', 'category']);
      const delegationID = delegationIDFor({
        sessionID,
        targetAgent,
        scenarioID: envelope.scenarioID,
        envelope,
      });
      if (sessionID) {
        latestDelegationBySession.set(sessionID, delegationID);
      }

      write(
        createTraceEvent(options, {
          sessionID,
          delegationID,
          scenarioID: envelope.scenarioID,
          loopID: envelope.loopID,
          loopRunID: envelope.loopRunID,
          loopStatus: envelope.loopStatus,
          completionClaim: envelope.completionClaim,
          verificationCommands: envelope.verificationCommands,
          verificationOutcome: envelope.verificationOutcome,
          event: 'delegation',
          toolName: 'task',
          toolArgsShape: Object.keys(args).sort(),
          targetAgent,
          activeDomains: envelope.activeDomains,
          domainRefs: envelope.domainRefs,
          domainSkills: envelope.domainSkills,
          warnings: result.warnings,
        }),
      );
    },
    async 'tool.execute.after'(input: unknown, output: unknown) {
      const toolName = extractToolName(input);
      const sessionID = extractSessionID(input);

      if (toolName === 'task') {
        const envelope = parseTaskContextEnvelope(extractLoopRunReportText(output));
        if (!envelope.loopID || !envelope.loopRunID || !envelope.loopStatus) {
          return;
        }

        write(
          createTraceEvent(options, {
            sessionID,
            delegationID: sessionID ? latestDelegationBySession.get(sessionID) : undefined,
            loopID: envelope.loopID,
            loopRunID: envelope.loopRunID,
            loopStatus: envelope.loopStatus,
            completionClaim: envelope.completionClaim,
            verificationCommands: envelope.verificationCommands,
            verificationOutcome: envelope.verificationOutcome,
            event: 'loop-run-report',
            toolName,
            activeDomains: [],
            domainRefs: [],
            domainSkills: [],
            warnings: [],
          }),
        );
        return;
      }

      if (toolName !== 'read') {
        return;
      }

      const args = extractArgs(output);
      const filePath = stringArg(args, ['filePath', 'path', 'file']);
      if (!filePath) {
        return;
      }

      const component = findDomainComponentByPath(options.domainPacks, filePath);
      if (!component) {
        return;
      }

      write(
        createTraceEvent(options, {
          sessionID,
          delegationID: sessionID ? latestDelegationBySession.get(sessionID) : undefined,
          event: 'domain-read',
          toolName,
          toolArgsShape: Object.keys(args).sort(),
          activeDomains: [],
          domainRefs: component.isSkill ? [] : [component.ref],
          domainSkills: component.isSkill ? [component.ref] : [],
          warnings: [],
        }),
      );
    },
  };
}
