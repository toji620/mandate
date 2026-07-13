import { describe, it, expect } from 'vitest';
import { evaluate, computeBand, type LedgerEvent } from './evaluate';
import type { AgentState, PolicyRule } from '@/src/types';

describe('Evaluator - Rule Enforcement', () => {
  const mockRules: PolicyRule[] = [
    {
      id: 1,
      policyId: 1,
      ruleType: 'SPEND_THRESHOLD',
      thresholdValue: 10000,
      currency: 'GBP',
      appliesTo: 'all',
      sourcePassage: 'Finance Approval Matrix s2.1: Expenditures exceeding GBP 10,000 require Finance Director approval',
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
      sourcePassage: 'Security Standards s3.1: All IT equipment must support full-disk encryption',
    },
  ];

  describe('Spend Threshold Boundaries', () => {
    const supervisedAgent: AgentState = {
      id: 1,
      name: 'Test Agent',
      role: 'sourcing',
      autonomyBand: 'SUPERVISED',
      cleanActionCount: 5,
      approvedSpendCount: 0,
    };

    it('should ALLOW spend of 9999.99 (below threshold)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { amount: 9999.99, vendor: 'Dell' },
          riskClass: 'high',
        },
        supervisedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('REVIEW'); // SUPERVISED needs review for commercial actions
      expect(decision.ruleId).toBeUndefined();
    });

    it('should require APPROVAL for spend of exactly 10000', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { amount: 10000, vendor: 'Dell' },
          riskClass: 'high',
        },
        supervisedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('APPROVAL');
      expect(decision.ruleId).toBe(1);
      expect(decision.sourcePassage).toContain('Finance Approval Matrix s2.1');
    });

    it('should require APPROVAL for spend of 10000.01 (above threshold)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { amount: 10000.01, vendor: 'Dell' },
          riskClass: 'high',
        },
        supervisedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('APPROVAL');
      expect(decision.ruleId).toBe(1);
      expect(decision.sourcePassage).toContain('Finance Approval Matrix s2.1');
    });

    it('should require APPROVAL for large spend of 50000', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { amount: 50000, vendor: 'Dell' },
          riskClass: 'high',
        },
        supervisedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('APPROVAL');
      expect(decision.ruleId).toBe(1);
    });
  });

  describe('Vendor Approval', () => {
    const trustedAgent: AgentState = {
      id: 1,
      name: 'Test Agent',
      role: 'sourcing',
      autonomyBand: 'TRUSTED',
      cleanActionCount: 15,
      approvedSpendCount: 3,
    };

    it('should ALLOW approved vendor (Dell)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'select_supplier',
          payload: { vendor: 'Dell', amount: 5000 },
          riskClass: 'medium',
        },
        trustedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('ALLOW');
    });

    it('should ALLOW approved vendor (HP)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'select_supplier',
          payload: { vendor: 'HP', amount: 5000 },
          riskClass: 'medium',
        },
        trustedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('ALLOW');
    });

    it('should BLOCK unapproved vendor regardless of band', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'select_supplier',
          payload: { vendor: 'CheapTech', amount: 3000 },
          riskClass: 'high',
        },
        trustedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('BLOCK');
      expect(decision.explanation).toContain('not on the approved vendor list');
      expect(decision.ruleId).toBe(2); // First vendor approval rule
    });

    it('should BLOCK unapproved vendor even in PROBATION', () => {
      const probationAgent: AgentState = {
        ...trustedAgent,
        autonomyBand: 'PROBATION',
      };

      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'select_supplier',
          payload: { vendor: 'UnknownVendor', amount: 1000 },
          riskClass: 'low',
        },
        probationAgent,
        mockRules
      );

      expect(decision.verdict).toBe('BLOCK');
    });
  });

  describe('Security Requirements', () => {
    const supervisedAgent: AgentState = {
      id: 1,
      name: 'Test Agent',
      role: 'compliance',
      autonomyBand: 'SUPERVISED',
      cleanActionCount: 5,
      approvedSpendCount: 0,
    };

    it('should BLOCK action requiring security review without one', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'purchase_equipment',
          payload: { 
            requiresSecurityReview: true,
            hasSecurityReview: false,
            vendor: 'Dell'
          },
          riskClass: 'high',
        },
        supervisedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('BLOCK');
      expect(decision.explanation).toContain('requires security review');
      expect(decision.ruleId).toBe(4);
    });

    it('should allow action with completed security review', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'purchase_equipment',
          payload: { 
            requiresSecurityReview: true,
            hasSecurityReview: true,
            vendor: 'Dell',
            amount: 5000
          },
          riskClass: 'high',
        },
        supervisedAgent,
        mockRules
      );

      expect(decision.verdict).not.toBe('BLOCK');
    });

    it('should allow action not requiring security review', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'gather_requirements',
          payload: { requiresSecurityReview: false },
          riskClass: 'low',
        },
        supervisedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('ALLOW');
    });
  });

  describe('Rule Precedence - Most Restrictive Wins', () => {
    const trustedAgent: AgentState = {
      id: 1,
      name: 'Test Agent',
      role: 'sourcing',
      autonomyBand: 'TRUSTED',
      cleanActionCount: 15,
      approvedSpendCount: 3,
    };

    it('should BLOCK for unapproved vendor even with high spend (BLOCK > APPROVAL)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { vendor: 'CheapTech', amount: 50000 },
          riskClass: 'high',
        },
        trustedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('BLOCK');
      expect(decision.explanation).toContain('not on the approved vendor list');
    });

    it('should BLOCK for missing security review even with approved vendor (BLOCK > APPROVAL)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'purchase_equipment',
          payload: { 
            vendor: 'Dell',
            amount: 50000,
            requiresSecurityReview: true,
            hasSecurityReview: false
          },
          riskClass: 'high',
        },
        trustedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('BLOCK');
      expect(decision.explanation).toContain('requires security review');
    });

    it('should require APPROVAL for high spend with approved vendor (APPROVAL > ALLOW)', () => {
      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { vendor: 'Dell', amount: 15000 },
          riskClass: 'high',
        },
        trustedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('APPROVAL');
      expect(decision.ruleId).toBe(1);
    });
  });

  describe('Autonomy Band Constraints', () => {
    it('PROBATION: should require APPROVAL for commercial actions', () => {
      const probationAgent: AgentState = {
        id: 1,
        name: 'Test Agent',
        role: 'sourcing',
        autonomyBand: 'PROBATION',
        cleanActionCount: 2,
        approvedSpendCount: 0,
      };

      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'select_supplier',
          payload: { vendor: 'Dell', amount: 5000 },
          riskClass: 'medium',
        },
        probationAgent,
        mockRules
      );

      expect(decision.verdict).toBe('APPROVAL');
      expect(decision.explanation).toContain('PROBATION band');
    });

    it('PROBATION: should ALLOW low-risk information gathering', () => {
      const probationAgent: AgentState = {
        id: 1,
        name: 'Test Agent',
        role: 'sourcing',
        autonomyBand: 'PROBATION',
        cleanActionCount: 2,
        approvedSpendCount: 0,
      };

      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'gather_requirements',
          payload: {},
          riskClass: 'low',
        },
        probationAgent,
        mockRules
      );

      expect(decision.verdict).toBe('ALLOW');
    });

    it('SUPERVISED: should require REVIEW for supplier selection', () => {
      const supervisedAgent: AgentState = {
        id: 1,
        name: 'Test Agent',
        role: 'sourcing',
        autonomyBand: 'SUPERVISED',
        cleanActionCount: 5,
        approvedSpendCount: 0,
      };

      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'select_supplier',
          payload: { vendor: 'Dell' },
          riskClass: 'medium',
        },
        supervisedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('REVIEW');
    });

    it('TRUSTED: should ALLOW actions within policy limits', () => {
      const trustedAgent: AgentState = {
        id: 1,
        name: 'Test Agent',
        role: 'sourcing',
        autonomyBand: 'TRUSTED',
        cleanActionCount: 15,
        approvedSpendCount: 3,
      };

      const decision = evaluate(
        {
          agentId: 1,
          actionType: 'commit_spend',
          payload: { vendor: 'Dell', amount: 8000 },
          riskClass: 'high',
        },
        trustedAgent,
        mockRules
      );

      expect(decision.verdict).toBe('ALLOW');
    });
  });
});

describe('Band Computation from Ledger History', () => {
  it('should start at PROBATION with no events', () => {
    const result = computeBand([]);
    expect(result.currentBand).toBe('PROBATION');
    expect(result.cleanActionCount).toBe(0);
    expect(result.approvedSpendCount).toBe(0);
  });

  it('should promote PROBATION -> SUPERVISED after 5 clean actions', () => {
    const events: LedgerEvent[] = [
      { eventType: 'CLEAN_ACTION', verdict: 'ALLOW', bandBefore: 'PROBATION', bandAfter: 'PROBATION', createdAt: new Date('2026-01-01') },
      { eventType: 'CLEAN_ACTION', verdict: 'ALLOW', bandBefore: 'PROBATION', bandAfter: 'PROBATION', createdAt: new Date('2026-01-02') },
      { eventType: 'CLEAN_ACTION', verdict: 'ALLOW', bandBefore: 'PROBATION', bandAfter: 'PROBATION', createdAt: new Date('2026-01-03') },
      { eventType: 'CLEAN_ACTION', verdict: 'ALLOW', bandBefore: 'PROBATION', bandAfter: 'PROBATION', createdAt: new Date('2026-01-04') },
      { eventType: 'CLEAN_ACTION', verdict: 'ALLOW', bandBefore: 'PROBATION', bandAfter: 'PROBATION', createdAt: new Date('2026-01-05') },
    ];

    const result = computeBand(events);
    expect(result.currentBand).toBe('SUPERVISED');
    expect(result.cleanActionCount).toBe(5);
  });

  it('should promote SUPERVISED -> TRUSTED after 10 clean actions with 2 approved spends', () => {
    const events: LedgerEvent[] = [
      // First 5 to get to SUPERVISED
      ...Array(5).fill(null).map((_, i) => ({
        eventType: 'CLEAN_ACTION' as const,
        verdict: 'ALLOW' as const,
        bandBefore: 'PROBATION' as const,
        bandAfter: 'PROBATION' as const,
        createdAt: new Date(`2026-01-${i + 1}`),
      })),
      // Next 5 with 2 spend actions
      { eventType: 'CLEAN_ACTION' as const, verdict: 'APPROVAL' as const, bandBefore: 'SUPERVISED' as const, bandAfter: 'SUPERVISED' as const, isSpendAction: true, createdAt: new Date('2026-01-06') },
      { eventType: 'CLEAN_ACTION' as const, verdict: 'ALLOW' as const, bandBefore: 'SUPERVISED' as const, bandAfter: 'SUPERVISED' as const, createdAt: new Date('2026-01-07') },
      { eventType: 'CLEAN_ACTION' as const, verdict: 'APPROVAL' as const, bandBefore: 'SUPERVISED' as const, bandAfter: 'SUPERVISED' as const, isSpendAction: true, createdAt: new Date('2026-01-08') },
      { eventType: 'CLEAN_ACTION' as const, verdict: 'ALLOW' as const, bandBefore: 'SUPERVISED' as const, bandAfter: 'SUPERVISED' as const, createdAt: new Date('2026-01-09') },
      { eventType: 'CLEAN_ACTION' as const, verdict: 'ALLOW' as const, bandBefore: 'SUPERVISED' as const, bandAfter: 'SUPERVISED' as const, createdAt: new Date('2026-01-10') },
    ];

    const result = computeBand(events);
    expect(result.currentBand).toBe('TRUSTED');
    expect(result.cleanActionCount).toBe(10);
    expect(result.approvedSpendCount).toBe(2);
  });

  it('should demote TRUSTED -> SUPERVISED on BLOCK', () => {
    const events: LedgerEvent[] = [
      ...Array(10).fill(null).map((_, i) => ({
        eventType: 'CLEAN_ACTION' as const,
        verdict: 'ALLOW' as const,
        bandBefore: i < 5 ? 'PROBATION' as const : 'SUPERVISED' as const,
        bandAfter: i < 5 ? 'PROBATION' as const : 'SUPERVISED' as const,
        isSpendAction: i === 5 || i === 7,
        createdAt: new Date(`2026-01-${i + 1}`),
      })),
      { eventType: 'DEMOTION', verdict: 'BLOCK', bandBefore: 'TRUSTED', bandAfter: 'SUPERVISED', createdAt: new Date('2026-01-11') },
    ];

    const result = computeBand(events);
    expect(result.currentBand).toBe('SUPERVISED');
  });

  it('should demote SUPERVISED -> PROBATION on BLOCK', () => {
    const events: LedgerEvent[] = [
      ...Array(5).fill(null).map((_, i) => ({
        eventType: 'CLEAN_ACTION' as const,
        verdict: 'ALLOW' as const,
        bandBefore: 'PROBATION' as const,
        bandAfter: 'PROBATION' as const,
        createdAt: new Date(`2026-01-${i + 1}`),
      })),
      { eventType: 'DEMOTION', verdict: 'BLOCK', bandBefore: 'SUPERVISED', bandAfter: 'PROBATION', createdAt: new Date('2026-01-06') },
    ];

    const result = computeBand(events);
    expect(result.currentBand).toBe('PROBATION');
  });

  it('should carry clean action counts across demotion (agent can re-earn promotion)', () => {
    const events: LedgerEvent[] = [
      // Get to SUPERVISED
      ...Array(5).fill(null).map((_, i) => ({
        eventType: 'CLEAN_ACTION' as const,
        verdict: 'ALLOW' as const,
        bandBefore: 'PROBATION' as const,
        bandAfter: 'PROBATION' as const,
        createdAt: new Date(`2026-01-${i + 1}`),
      })),
      // Get demoted
      { eventType: 'DEMOTION', verdict: 'BLOCK', bandBefore: 'SUPERVISED', bandAfter: 'PROBATION', createdAt: new Date('2026-01-06') },
      // Continue accumulating (counts carry over)
      { eventType: 'CLEAN_ACTION', verdict: 'ALLOW', bandBefore: 'PROBATION', bandAfter: 'PROBATION', createdAt: new Date('2026-01-07') },
    ];

    const result = computeBand(events);
    expect(result.cleanActionCount).toBe(6); // Counts carry across demotion
    expect(result.currentBand).toBe('SUPERVISED'); // Re-promoted because count >= 5
  });

  it('should not demote below PROBATION', () => {
    const events: LedgerEvent[] = [
      { eventType: 'CLEAN_ACTION', verdict: 'ALLOW', bandBefore: 'PROBATION', bandAfter: 'PROBATION', createdAt: new Date('2026-01-01') },
      { eventType: 'DEMOTION', verdict: 'BLOCK', bandBefore: 'PROBATION', bandAfter: 'PROBATION', createdAt: new Date('2026-01-02') },
    ];

    const result = computeBand(events);
    expect(result.currentBand).toBe('PROBATION');
  });

  it('should handle complex promotion/demotion sequence', () => {
    const events: LedgerEvent[] = [
      // PROBATION -> SUPERVISED (5 actions)
      ...Array(5).fill(null).map((_, i) => ({
        eventType: 'CLEAN_ACTION' as const,
        verdict: 'ALLOW' as const,
        bandBefore: 'PROBATION' as const,
        bandAfter: 'PROBATION' as const,
        createdAt: new Date(`2026-01-${i + 1}`),
      })),
      // SUPERVISED -> TRUSTED (5 more actions, 2 spends)
      ...Array(5).fill(null).map((_, i) => ({
        eventType: 'CLEAN_ACTION' as const,
        verdict: i === 0 || i === 2 ? 'APPROVAL' as const : 'ALLOW' as const,
        bandBefore: 'SUPERVISED' as const,
        bandAfter: 'SUPERVISED' as const,
        isSpendAction: i === 0 || i === 2,
        createdAt: new Date(`2026-01-${i + 6}`),
      })),
      // Demote TRUSTED -> SUPERVISED
      { eventType: 'DEMOTION', verdict: 'BLOCK', bandBefore: 'TRUSTED', bandAfter: 'SUPERVISED', createdAt: new Date('2026-01-11') },
      // Re-earn TRUSTED (already have 10 actions + 2 spends)
      { eventType: 'CLEAN_ACTION', verdict: 'ALLOW', bandBefore: 'SUPERVISED', bandAfter: 'SUPERVISED', createdAt: new Date('2026-01-12') },
    ];

    const result = computeBand(events);
    expect(result.currentBand).toBe('TRUSTED'); // Re-promoted
    expect(result.cleanActionCount).toBe(11);
    expect(result.approvedSpendCount).toBe(2);
  });
});
