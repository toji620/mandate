import { describe, it, expect } from 'vitest';
import { computeBand, evaluate, PROMOTION_THRESHOLDS, type LedgerEvent } from './evaluate';
import type { AgentState, AutonomyBand, PolicyRule } from '@/src/types';

describe('Evaluator - Rule Enforcement', () => {
  const mockRules: PolicyRule[] = [
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
      appliesTo: 'Dell',
      sourcePassage: 'Approved Vendor List: Dell is an approved supplier',
    },
    {
      id: 3,
      policyId: 2,
      ruleType: 'VENDOR_APPROVAL',
      appliesTo: 'HP',
      sourcePassage: 'Approved Vendor List: HP is an approved supplier',
    },
    {
      id: 4,
      policyId: 3,
      ruleType: 'SECURITY_REQUIREMENT',
      appliesTo: 'IT equipment',
      sourcePassage:
        'Security Standards s3.1: All IT equipment must support full-disk encryption',
    },
  ];

  const agent = (autonomyBand: AutonomyBand, reputation = 0): AgentState => ({
    id: 1,
    name: 'Test Agent',
    role: 'sourcing',
    autonomyBand,
    reputation,
    approvedSpendCount: 0,
  });

  describe('Spend Threshold Boundaries', () => {
    const supervised = agent('SUPERVISED', 5);

    it('does not fire the threshold rule below it (9999.99)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { amount: 9999.99, vendor: 'Dell' },
          riskClass: 'high',
        },
        supervised,
        mockRules
      );

      // Under the threshold, policy is silent; only the band speaks.
      expect(decision.verdict).toBe('REVIEW');
      expect(decision.ruleId).toBeUndefined();
    });

    it('requires APPROVAL at exactly the threshold (10000)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { amount: 10000, vendor: 'Dell' },
          riskClass: 'high',
        },
        supervised,
        mockRules
      );

      expect(decision.verdict).toBe('APPROVAL');
      expect(decision.ruleId).toBe(1);
      expect(decision.sourcePassage).toContain('Finance Approval Matrix s2.1');
    });

    it('requires APPROVAL just above the threshold (10000.01)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { amount: 10000.01, vendor: 'Dell' },
          riskClass: 'high',
        },
        supervised,
        mockRules
      );

      expect(decision.verdict).toBe('APPROVAL');
      expect(decision.ruleId).toBe(1);
    });

    it('requires APPROVAL for a large spend (50000)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { amount: 50000, vendor: 'Dell' },
          riskClass: 'high',
        },
        supervised,
        mockRules
      );

      expect(decision.verdict).toBe('APPROVAL');
      expect(decision.ruleId).toBe(1);
    });
  });

  describe('Vendor Approval', () => {
    const trusted = agent('TRUSTED', 15);

    it('ALLOWs an approved vendor (Dell)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'select_supplier',
          payload: { vendor: 'Dell', amount: 5000 },
          riskClass: 'medium',
        },
        trusted,
        mockRules
      );

      expect(decision.verdict).toBe('ALLOW');
    });

    it('BLOCKs an unapproved vendor even for a TRUSTED agent', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'select_supplier',
          payload: { vendor: 'CheapTech', amount: 3000 },
          riskClass: 'high',
        },
        trusted,
        mockRules
      );

      expect(decision.verdict).toBe('BLOCK');
      expect(decision.explanation).toContain('not on the approved vendor list');
      expect(decision.ruleId).toBe(2);
      expect(decision.sourcePassage).toContain('Approved Vendor List');
    });

    it('BLOCKs an unapproved vendor in PROBATION too', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'select_supplier',
          payload: { vendor: 'UnknownVendor', amount: 1000 },
          riskClass: 'low',
        },
        agent('PROBATION'),
        mockRules
      );

      expect(decision.verdict).toBe('BLOCK');
    });
  });

  describe('Security Requirements', () => {
    const supervised = agent('SUPERVISED', 5);

    it('BLOCKs an action needing a security review that has not happened', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'purchase_equipment',
          payload: { requiresSecurityReview: true, hasSecurityReview: false, vendor: 'Dell' },
          riskClass: 'high',
        },
        supervised,
        mockRules
      );

      expect(decision.verdict).toBe('BLOCK');
      expect(decision.explanation).toContain('requires security review');
      expect(decision.ruleId).toBe(4);
    });

    it('does not BLOCK once the security review is complete', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'purchase_equipment',
          payload: {
            requiresSecurityReview: true,
            hasSecurityReview: true,
            vendor: 'Dell',
            amount: 5000,
          },
          riskClass: 'high',
        },
        supervised,
        mockRules
      );

      expect(decision.verdict).not.toBe('BLOCK');
    });
  });

  describe('Precedence: the stricter of policy and band always wins', () => {
    const trusted = agent('TRUSTED', 15);

    it('BLOCK beats APPROVAL: unapproved vendor at a high spend', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { vendor: 'CheapTech', amount: 50000 },
          riskClass: 'high',
        },
        trusted,
        mockRules
      );

      expect(decision.verdict).toBe('BLOCK');
      expect(decision.explanation).toContain('not on the approved vendor list');
    });

    it('policy beats band: a TRUSTED agent still needs APPROVAL over the threshold', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { vendor: 'Dell', amount: 15000 },
          riskClass: 'high',
        },
        trusted,
        mockRules
      );

      expect(decision.verdict).toBe('APPROVAL');
      expect(decision.ruleId).toBe(1);
    });

    it('band beats policy: PROBATION needs APPROVAL even for a spend under the threshold', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { vendor: 'Dell', amount: 500 },
          riskClass: 'medium',
        },
        agent('PROBATION'),
        mockRules
      );

      expect(decision.verdict).toBe('APPROVAL');
      expect(decision.explanation).toContain('PROBATION');
    });
  });

  describe('Autonomy Band Constraints', () => {
    it('PROBATION: requires APPROVAL for commercial actions', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'select_supplier',
          payload: { vendor: 'Dell', amount: 5000 },
          riskClass: 'medium',
        },
        agent('PROBATION', 2),
        mockRules
      );

      expect(decision.verdict).toBe('APPROVAL');
      expect(decision.explanation).toContain('PROBATION');
    });

    it('PROBATION: ALLOWs read-only information gathering', () => {
      const decision = evaluate(
        { agentId: 1, actionType: 'gather_requirements', payload: {}, riskClass: 'low' },
        agent('PROBATION', 2),
        mockRules
      );

      expect(decision.verdict).toBe('ALLOW');
    });

    it('SUPERVISED: requires REVIEW for supplier selection', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'select_supplier',
          payload: { vendor: 'Dell' },
          riskClass: 'medium',
        },
        agent('SUPERVISED', 5),
        mockRules
      );

      expect(decision.verdict).toBe('REVIEW');
    });

    it('SUPERVISED: ALLOWs read-only actions', () => {
      const decision = evaluate(
        { agentId: 1, actionType: 'request_quotations', payload: {}, riskClass: 'low' },
        agent('SUPERVISED', 5),
        mockRules
      );

      expect(decision.verdict).toBe('ALLOW');
    });

    it('TRUSTED: ALLOWs commercial actions within policy limits', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { vendor: 'Dell', amount: 8000 },
          riskClass: 'high',
        },
        agent('TRUSTED', 15),
        mockRules
      );

      expect(decision.verdict).toBe('ALLOW');
    });
  });
});

describe('Reputation and band computation from ledger history', () => {
  const clean = (isSpendAction = false): LedgerEvent => ({
    eventType: 'CLEAN_ACTION',
    verdict: isSpendAction ? 'APPROVAL' : 'ALLOW',
    bandBefore: 'PROBATION',
    bandAfter: 'PROBATION',
    isSpendAction,
    createdAt: new Date('2026-01-01'),
  });

  const blocked = (): LedgerEvent => ({
    eventType: 'DEMOTION',
    verdict: 'BLOCK',
    bandBefore: 'SUPERVISED',
    bandAfter: 'PROBATION',
    createdAt: new Date('2026-01-01'),
  });

  const many = (n: number, isSpendAction = false) =>
    Array.from({ length: n }, () => clean(isSpendAction));

  it('starts every agent at PROBATION with zero reputation', () => {
    const result = computeBand([]);

    expect(result.currentBand).toBe('PROBATION');
    expect(result.reputation).toBe(0);
  });

  it('promotes PROBATION -> SUPERVISED once reputation reaches the threshold', () => {
    const result = computeBand(many(PROMOTION_THRESHOLDS.PROBATION_TO_SUPERVISED));

    expect(result.currentBand).toBe('SUPERVISED');
  });

  it('does not promote one action short of the threshold', () => {
    const result = computeBand(many(PROMOTION_THRESHOLDS.PROBATION_TO_SUPERVISED - 1));

    expect(result.currentBand).toBe('PROBATION');
  });

  it('promotes SUPERVISED -> TRUSTED at 10 reputation with 2 approved spends', () => {
    const result = computeBand([...many(8), ...many(2, true)]);

    expect(result.reputation).toBe(10);
    expect(result.approvedSpendCount).toBe(2);
    expect(result.currentBand).toBe('TRUSTED');
  });

  it('withholds TRUSTED when the reputation is there but the approved spends are not', () => {
    const result = computeBand(many(12));

    expect(result.reputation).toBe(12);
    expect(result.approvedSpendCount).toBe(0);
    expect(result.currentBand).toBe('SUPERVISED');
  });

  it('demotes exactly one band on a BLOCK', () => {
    const result = computeBand([...many(8), ...many(2, true), blocked()]);

    expect(result.currentBand).toBe('SUPERVISED'); // was TRUSTED
  });

  it('never demotes below PROBATION', () => {
    const result = computeBand([clean(), blocked(), blocked(), blocked()]);

    expect(result.currentBand).toBe('PROBATION');
  });

  // The heart of it: this is the bug that made a demotion evaporate one step
  // after it was imposed. A BLOCK must cost the agent its standing.
  it('RESETS reputation to zero on a BLOCK, so the demotion actually sticks', () => {
    const result = computeBand([...many(5), blocked()]);

    expect(result.currentBand).toBe('PROBATION');
    expect(result.reputation).toBe(0);
  });

  it('does not let a demoted agent bounce straight back on its next clean action', () => {
    const result = computeBand([...many(5), blocked(), clean()]);

    expect(result.reputation).toBe(1);
    expect(result.currentBand).toBe('PROBATION');
  });

  it('makes a demoted agent re-earn the band from scratch', () => {
    const justShort = computeBand([
      ...many(5),
      blocked(),
      ...many(PROMOTION_THRESHOLDS.PROBATION_TO_SUPERVISED - 1),
    ]);
    expect(justShort.currentBand).toBe('PROBATION');

    const earnedBack = computeBand([
      ...many(5),
      blocked(),
      ...many(PROMOTION_THRESHOLDS.PROBATION_TO_SUPERVISED),
    ]);
    expect(earnedBack.currentBand).toBe('SUPERVISED');
  });

  it('keeps a lifetime clean-action total for audit, separate from reputation', () => {
    const result = computeBand([...many(5), blocked(), ...many(2)]);

    expect(result.reputation).toBe(2); // standing: earned back since the block
    expect(result.lifetimeCleanActions).toBe(7); // career total: never reset
  });
});
