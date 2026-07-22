import { describe, it, expect } from 'vitest';
import { evaluate } from './evaluate';
import type { AgentState, PolicyRule, ProposedAction } from '@/src/types';

/**
 * A vendor can be on the approved list yet temporarily SUSPENDED — e.g. pending a
 * security audit or a contract renewal. Using a suspended vendor is barred until
 * the suspension lifts.
 *
 * This is the sharpest test of the whole idea: the agent picks a vendor that
 * genuinely IS approved, on perfectly reasonable commercial grounds, and is still
 * blocked — because the list has a state the agent has no way to see. The
 * evaluator holds that state; the agent never does.
 */

const rules: PolicyRule[] = [
  {
    id: 1,
    policyId: 1,
    ruleType: 'SPEND_THRESHOLD',
    thresholdValue: 10000,
    currency: 'GBP',
    appliesTo: 'all',
    sourcePassage: 'Finance Approval Matrix s2.1',
  },
  { id: 2, policyId: 2, ruleType: 'VENDOR_APPROVAL', appliesTo: 'Dell', sourcePassage: 'AVL: Dell approved' },
  { id: 3, policyId: 2, ruleType: 'VENDOR_APPROVAL', appliesTo: 'HP', sourcePassage: 'AVL: HP approved' },
  { id: 4, policyId: 2, ruleType: 'VENDOR_APPROVAL', appliesTo: 'Lenovo', sourcePassage: 'AVL: Lenovo approved' },
  {
    id: 5,
    policyId: 3,
    ruleType: 'VENDOR_SUSPENSION',
    appliesTo: 'Lenovo',
    sourcePassage:
      'Vendor Risk Register 2026-Q3: Lenovo is suspended pending a security audit; no new orders may be placed',
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
  return { agentId: 1, actionType, payload, riskClass: 'medium' };
}

describe('a suspended vendor is blocked even though it is on the approved list', () => {
  it('BLOCKs selecting a suspended vendor', () => {
    const decision = evaluate(action('select_supplier', { vendor: 'Lenovo' }), supervised, rules, {
      priorApprovals: [],
    });

    expect(decision.verdict).toBe('BLOCK');
  });

  it('cites the suspension passage, not the approval passage', () => {
    const decision = evaluate(action('select_supplier', { vendor: 'Lenovo' }), supervised, rules, {
      priorApprovals: [],
    });

    expect(decision.ruleId).toBe(5);
    expect(decision.sourcePassage).toContain('suspended');
    expect(decision.explanation.toLowerCase()).toContain('suspend');
  });

  it('BLOCKs committing a spend to a suspended vendor', () => {
    const decision = evaluate(
      action('commit_spend', { vendor: 'Lenovo', amount: 9000 }),
      supervised,
      rules,
      { priorApprovals: [] }
    );

    expect(decision.verdict).toBe('BLOCK');
  });

  it('leaves an approved, non-suspended vendor unaffected by the suspension rule', () => {
    // Dell is approved and not suspended. Selecting it is a normal SUPERVISED
    // commercial action -> REVIEW, never blocked.
    const decision = evaluate(action('select_supplier', { vendor: 'Dell' }), supervised, rules, {
      priorApprovals: [],
    });

    expect(decision.verdict).not.toBe('BLOCK');
  });

  it('only suspends the named vendor', () => {
    const hp = evaluate(action('select_supplier', { vendor: 'HP' }), supervised, rules, {
      priorApprovals: [],
    });
    expect(hp.verdict).not.toBe('BLOCK');
  });

  it('does not touch read-only actions that name no vendor', () => {
    const decision = evaluate(
      action('gather_requirements', { item: 'laptops' }),
      supervised,
      rules,
      { priorApprovals: [] }
    );
    expect(decision.verdict).toBe('ALLOW');
  });

  it('still blocks an unapproved vendor ahead of any suspension check', () => {
    // CheapTech is neither approved nor suspended: the approval rule catches it.
    const decision = evaluate(action('select_supplier', { vendor: 'CheapTech' }), supervised, rules, {
      priorApprovals: [],
    });
    expect(decision.verdict).toBe('BLOCK');
    expect(decision.explanation).toContain('not on the approved vendor list');
  });
});
