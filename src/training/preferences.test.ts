import { describe, it, expect } from 'vitest';
import { buildPreferencePairs, type LabelledDecision } from './preferences';

/**
 * The evaluator is a free, deterministic reward labeller: every decision it
 * makes is a labelled training example, with no human annotation. This turns a
 * mission's audit log into DPO preference pairs — a BLOCKed proposal is the
 * `rejected` completion, a later permitted proposal of the same action type is
 * the `chosen` one.
 */

function decision(over: Partial<LabelledDecision>): LabelledDecision {
  return {
    missionId: 'm1',
    missionGoal: 'Buy 20 laptops',
    stepNumber: 1,
    actionType: 'select_supplier',
    verdict: 'ALLOW',
    actionPayload: {},
    explanation: '',
    sourcePassage: null,
    riskClass: 'medium',
    ...over,
  };
}

describe('buildPreferencePairs', () => {
  it('pairs a blocked proposal with a later permitted one of the same action type', () => {
    const decisions: LabelledDecision[] = [
      decision({
        stepNumber: 1,
        actionType: 'select_supplier',
        verdict: 'BLOCK',
        actionPayload: { vendor: 'CheapTech' },
        explanation: 'Vendor "CheapTech" is not on the approved vendor list',
        sourcePassage: 'Approved Vendor List',
      }),
      decision({
        stepNumber: 2,
        actionType: 'select_supplier',
        verdict: 'REVIEW',
        actionPayload: { vendor: 'Dell' },
      }),
    ];

    const { pairs, skipped } = buildPreferencePairs(decisions);

    expect(pairs).toHaveLength(1);
    expect(skipped).toBe(0);
    expect(pairs[0].rejected).toEqual({ vendor: 'CheapTech' });
    expect(pairs[0].chosen).toEqual({ vendor: 'Dell' });
    expect(pairs[0].rejected_because).toContain('not on the approved vendor list');
    expect(pairs[0].cited_rule).toBe('Approved Vendor List');
    expect(pairs[0].prompt).toContain('select_supplier');
  });

  it('emits no pairs for a mission with no blocks', () => {
    const decisions = [
      decision({ stepNumber: 1, verdict: 'ALLOW' }),
      decision({ stepNumber: 2, verdict: 'APPROVAL' }),
    ];

    const { pairs } = buildPreferencePairs(decisions);
    expect(pairs).toEqual([]);
  });

  it('skips a block that has no clean counterpart of the same action type, and counts it', () => {
    const decisions = [
      decision({
        stepNumber: 1,
        actionType: 'commit_spend',
        verdict: 'BLOCK',
        actionPayload: { vendor: 'CheapTech', amount: 5000 },
      }),
      // A later permitted action, but of a DIFFERENT type — not a clean pair.
      decision({ stepNumber: 2, actionType: 'issue_purchase_order', verdict: 'ALLOW' }),
    ];

    const { pairs, skipped } = buildPreferencePairs(decisions);
    expect(pairs).toEqual([]);
    expect(skipped).toBe(1);
  });

  it('does not pair a block with an EARLIER permitted action', () => {
    const decisions = [
      decision({ stepNumber: 1, actionType: 'select_supplier', verdict: 'REVIEW', actionPayload: { vendor: 'Dell' } }),
      decision({ stepNumber: 2, actionType: 'select_supplier', verdict: 'BLOCK', actionPayload: { vendor: 'CheapTech' } }),
    ];

    const { pairs, skipped } = buildPreferencePairs(decisions);
    // The clean example must come AFTER the mistake — it is the correction.
    expect(pairs).toEqual([]);
    expect(skipped).toBe(1);
  });

  it('keeps pairs from different missions separate', () => {
    const decisions = [
      decision({ missionId: 'm1', stepNumber: 1, verdict: 'BLOCK', actionPayload: { vendor: 'CheapTech' } }),
      decision({ missionId: 'm1', stepNumber: 2, verdict: 'ALLOW', actionPayload: { vendor: 'Dell' } }),
      // m2's clean action must not be borrowed to fix m1's block.
      decision({ missionId: 'm2', stepNumber: 1, verdict: 'ALLOW', actionPayload: { vendor: 'HP' } }),
    ];

    const { pairs } = buildPreferencePairs(decisions);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].chosen).toEqual({ vendor: 'Dell' });
  });
});

describe('same-step retry corrections', () => {
  it('pairs a block with its bounded-retry correction at the same step number', () => {
    const result = buildPreferencePairs([
      {
        missionId: 'm1',
        missionGoal: 'buy laptops',
        stepNumber: 4,
        actionType: 'select_supplier',
        verdict: 'BLOCK',
        actionPayload: { vendor: 'CheapTech', amount: 18000 },
        explanation: 'Vendor "CheapTech" is not on the approved vendor list',
        sourcePassage: 'All purchases must be made from approved vendors',
        riskClass: 'medium',
      },
      {
        missionId: 'm1',
        missionGoal: 'buy laptops',
        stepNumber: 4,
        actionType: 'select_supplier',
        verdict: 'APPROVAL',
        actionPayload: { vendor: 'Dell', amount: 22400 },
        explanation: 'Commercial action requires approval',
        sourcePassage: null,
        riskClass: 'medium',
      },
    ]);

    expect(result.pairs).toHaveLength(1);
    expect(result.skipped).toBe(0);
    expect(result.pairs[0].rejected).toEqual({ vendor: 'CheapTech', amount: 18000 });
    expect(result.pairs[0].chosen).toEqual({ vendor: 'Dell', amount: 22400 });
  });

  it('does not pair a block with a same-step decision that came BEFORE it', () => {
    const result = buildPreferencePairs([
      {
        missionId: 'm1',
        missionGoal: 'buy laptops',
        stepNumber: 4,
        actionType: 'select_supplier',
        verdict: 'REVIEW',
        actionPayload: { vendor: 'Dell' },
        explanation: null,
        sourcePassage: null,
        riskClass: 'medium',
      },
      {
        missionId: 'm1',
        missionGoal: 'buy laptops',
        stepNumber: 4,
        actionType: 'select_supplier',
        verdict: 'BLOCK',
        actionPayload: { vendor: 'CheapTech' },
        explanation: 'not approved',
        sourcePassage: null,
        riskClass: 'medium',
      },
    ]);

    expect(result.pairs).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });
});

describe('newest-first input (the getAllDecisions order)', () => {
  it('pairs correctly when rows arrive in descending persistence order', () => {
    const result = buildPreferencePairs([
      {
        id: 44,
        missionId: 'm1',
        missionGoal: 'buy laptops',
        stepNumber: 4,
        actionType: 'select_supplier',
        verdict: 'REVIEW',
        actionPayload: { vendor: 'Dell', amount: 22400 },
        explanation: null,
        sourcePassage: null,
        riskClass: 'medium',
      },
      {
        id: 42,
        missionId: 'm1',
        missionGoal: 'buy laptops',
        stepNumber: 4,
        actionType: 'select_supplier',
        verdict: 'BLOCK',
        actionPayload: { vendor: 'CheapTech', amount: 18000 },
        explanation: 'not approved',
        sourcePassage: null,
        riskClass: 'medium',
      },
    ]);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].chosen).toEqual({ vendor: 'Dell', amount: 22400 });
    expect(result.pairs[0].rejected).toEqual({ vendor: 'CheapTech', amount: 18000 });
  });
});
