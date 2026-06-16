import type { ResolvedLoopConfigMap } from '../shared/agent-types';

function formatList(values: string[] | undefined) {
  return values && values.length > 0 ? values.join(', ') : 'none';
}

export function buildLoopPromptSection(loops: ResolvedLoopConfigMap) {
  const entries = Object.entries(loops).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return '';
  }

  const lines = [
    '## Loop Catalog',
    '',
    'Use the Loop Catalog when a task is part of a recurring or goal-driven engineering loop.',
    'Routing agents should pass the matching loop id in the Task Context Envelope as `Loop: <loop-id>`.',
    'Target specialists should read the loop contract and inbox before claiming loop progress or completion.',
    'If no loop clearly applies, use `Loop: none`.',
    '',
    'Available loops:',
  ];

  for (const [id, loop] of entries) {
    const agents = loop.agents ?? {};
    lines.push(
      '',
      `### \`${id}\``,
      `Description: ${loop.description}`,
      `Objective: ${loop.objective}`,
      `Trigger: ${loop.trigger.type}${loop.trigger.cadence ? ` (${loop.trigger.cadence})` : ''}`,
      `Inbox: ${loop.inbox_path}`,
      `Agents: triage=${agents.triage ?? 'planner'}, maker=${agents.maker ?? 'builder'}, verifier=${agents.verifier ?? 'verifier'}`,
      `Active domains: ${
        loop.active_domains && loop.active_domains.length > 0
          ? loop.active_domains.map(domain => `${domain.id}: ${domain.responsibility}`).join(', ')
          : 'none'
      }`,
      `Domain refs: ${formatList(loop.domain_refs)}`,
      `Domain skills: ${formatList(loop.domain_skills)}`,
      `Verification commands: ${loop.verification.commands.join(', ')}`,
      `Completion: ${loop.verification.completion}`,
    );
  }

  return lines.join('\n');
}
