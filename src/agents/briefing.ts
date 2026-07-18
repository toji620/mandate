import type { PolicyRule } from '@/src/types';

export type BriefingMode = 'none' | 'full';

export interface BlockedProposal {
  actionType: string;
  payload: Record<string, unknown>;
  reason: string;
}

/**
 * Renders the policy for the agent's prompt.
 *
 * This is an EFFICIENCY measure, not a safety measure. A briefed agent wastes
 * fewer turns proposing things that will obviously be blocked — which matters,
 * because failed retries are the thing that actually grows an agent's context.
 *
 * It guarantees nothing. A briefed agent can still be argued round by a big
 * enough saving, hallucinate, or be prompt-injected. The evaluator is what makes
 * the rule a rule. Telling the model is a suggestion; the evaluator is the law.
 *
 * `none` is the demo setting: an uninformed agent genuinely proposes the cheaper
 * unapproved supplier, and the block is an honest test rather than a staged one.
 */
export function renderBriefing(rules: PolicyRule[], mode: BriefingMode): string {
  if (mode === 'none') return '';

  const vendors = rules
    .filter((r) => r.ruleType === 'VENDOR_APPROVAL' && r.appliesTo && r.appliesTo !== 'all')
    .map((r) => r.appliesTo)
    .join(', ');

  const thresholds = rules
    .filter((r) => r.ruleType === 'SPEND_THRESHOLD' && r.thresholdValue !== undefined)
    .sort((a, b) => (a.thresholdValue ?? 0) - (b.thresholdValue ?? 0))
    .map((r) => `over ${r.thresholdValue} ${r.currency ?? 'GBP'} requires human approval`)
    .join('; ');

  const lines = ['=== POLICY (guidance) ==='];
  if (vendors) lines.push(`Approved vendors: ${vendors}. No other vendor may be used.`);
  if (thresholds) lines.push(`Spend limits: ${thresholds}.`);
  lines.push(
    'These are enforced by a separate deterministic evaluator regardless of what you propose. ' +
      'Proposing a violation will not succeed — it will be blocked and cost you standing.'
  );

  return lines.join('\n');
}

/**
 * What this mission already tried and had rejected.
 *
 * Without this, a blocked agent re-proposes the same rejected action forever:
 * it still wants the cheaper vendor, and nothing told it why it failed.
 */
export function renderBlockedProposals(blocked: BlockedProposal[]): string {
  if (blocked.length === 0) return '';

  const lines = ['=== ALREADY REJECTED THIS MISSION — do not repeat these ==='];

  for (const b of blocked) {
    lines.push(`- ${b.actionType} ${JSON.stringify(b.payload)}\n  REJECTED: ${b.reason}`);
  }

  return lines.join('\n');
}
