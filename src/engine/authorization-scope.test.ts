import { describe, it, expect } from 'vitest';
import { evaluate } from './evaluate';
import { normalizeProposal } from '@/src/agents/normalize';
import type { AgentState, PolicyRule, ProposedAction } from '@/src/types';

/**
 * Regression tests for two authority holes found by running the real agent.
 *
 * Both were invisible to the curated golden-path fixtures, which happened to use
 * a different amount at each step. A live Granite run kept its numbers
 * consistent across steps and walked straight through both.
 *
 * The payloads below are copied verbatim from that run
 * (ibm/granite-4-h-small, data/fixtures/live-capture.json).
 */

const rules: PolicyRule[] = [
  {
    id: 1,
    policyId: 1,
    ruleType: 'SPEND_THRESHOLD',
    thresholdValue: 10000,
    currency: 'GBP',
    appliesTo: 'all',
    sourcePassage:
      'Finance Approval Matrix s2.1: Expenditures exceeding GBP 10,000 require Finance Director approval',
  },
  {
    id: 2,
    policyId: 2,
    ruleType: 'VENDOR_APPROVAL',
    appliesTo: 'HP',
    sourcePassage: 'Approved Vendor List: HP is an approved supplier',
  },
  {
    id: 3,
    policyId: 2,
    ruleType: 'VENDOR_APPROVAL',
    appliesTo: 'Dell',
    sourcePassage: 'Approved Vendor List: Dell is an approved supplier',
  },
];

const supervised: AgentState = {
  id: 1,
  name: 'Sourcing Agent',
  role: 'sourcing',
  autonomyBand: 'SUPERVISED',
  reputation: 4,
  approvedSpendCount: 0,
};

function action(actionType: string, payload: Record<string, unknown>): ProposedAction {
  return { agentId: 1, actionType, payload, riskClass: 'high' };
}

describe('an approval only authorises the action it was granted for', () => {
  it('does not let an approved select_supplier authorise a commit_spend', () => {
    // A human approved "use HP" — a choice of supplier, which moves no money.
    const approvedSelection = {
      actionType: 'select_supplier',
      vendor: 'HP',
      amount: 22600,
    };

    // The agent then asks to actually commit the GBP 22,600.
    const decision = evaluate(
      action('commit_spend', { vendor: 'HP', amount: 22600 }),
      supervised,
      rules,
      { priorApprovals: [approvedSelection] }
    );

    // Nobody ever approved a SPEND. The threshold must still bite.
    expect(decision.verdict).toBe('APPROVAL');
  });

  it('still lets an approved commit_spend authorise the matching purchase order', () => {
    // This is the golden path: approving the spend covers the paperwork that
    // executes it. Fixing the hole above must not break this.
    const approvedSpend = {
      actionType: 'commit_spend',
      vendor: 'Dell',
      amount: 22400,
    };

    const decision = evaluate(
      action('issue_purchase_order', { vendor: 'Dell', amount: 22400 }),
      supervised,
      rules,
      { priorApprovals: [approvedSpend] }
    );

    expect(decision.verdict).toBe('ALLOW');
  });
});

describe('a spend that does not declare an amount cannot be waved through', () => {
  it('escalates when the amount field is missing entirely', () => {
    // Granite wrote "amountGBP" instead of "amount". The threshold check read
    // payload.amount, got undefined, and skipped itself.
    const decision = evaluate(
      action('issue_purchase_order', { vendor: 'HP', amountGBP: 22600 }),
      supervised,
      rules,
      { priorApprovals: [] }
    );

    expect(decision.verdict).toBe('APPROVAL');
  });

  it('normalises an aliased amount so the threshold is actually checked, not escalated blindly', () => {
    const trusted: AgentState = { ...supervised, autonomyBand: 'TRUSTED' };

    // The amount lives only in "amountGBP", and it is well UNDER the threshold.
    // If the value were discarded, this would escalate to APPROVAL. Interpreted,
    // a TRUSTED agent's sub-threshold spend to an approved vendor is ALLOW — which
    // proves the number was read, not thrown away.
    const raw = action('commit_spend', { vendor: 'Dell', amountGBP: 5000 });
    const decision = evaluate(normalizeProposal(raw), trusted, rules, { priorApprovals: [] });

    expect(decision.verdict).toBe('ALLOW');
  });

  it('normalises an aliased over-threshold amount into an APPROVAL that cites the sum', () => {
    const raw = action('commit_spend', { vendor: 'Dell', amountGBP: 22600 });
    const decision = evaluate(normalizeProposal(raw), supervised, rules, { priorApprovals: [] });

    expect(decision.verdict).toBe('APPROVAL');
    // The decision names the real amount — evidence the value was interpreted,
    // not merely escalated for being unverifiable.
    expect(decision.explanation).toContain('22600');
  });

  it('escalates when the amount is not a usable number', () => {
    const decision = evaluate(
      action('commit_spend', { vendor: 'HP', amount: 'twenty two thousand' }),
      supervised,
      rules,
      { priorApprovals: [] }
    );

    expect(decision.verdict).toBe('APPROVAL');
  });

  it('does not let an approval with no amount match a spend with no amount', () => {
    // undefined === undefined is true, so a blank approval used to satisfy any
    // spend that also failed to declare its amount.
    const blankApproval = {
      actionType: 'commit_spend',
      vendor: undefined,
      amount: undefined,
    };

    const decision = evaluate(
      action('commit_spend', { description: 'laptops' }),
      supervised,
      rules,
      { priorApprovals: [blankApproval] }
    );

    expect(decision.verdict).toBe('APPROVAL');
  });
});
