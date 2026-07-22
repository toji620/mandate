import { describe, it, expect } from 'vitest';
import { evaluate } from './evaluate';
import type { AgentState, AutonomyBand, PolicyRule } from '@/src/types';

/**
 * Safety invariants.
 *
 * These are not feature tests. Each one asserts a property that must hold for
 * EVERY band and EVERY action type, so that no future band rule, special case,
 * or new action type can quietly open a hole in policy enforcement.
 *
 * SPEC: "The band tightens policy, never loosens it: a TRUSTED agent still
 * cannot exceed a spend threshold."
 */

const THRESHOLD = 10000;

const rules: PolicyRule[] = [
  {
    id: 1,
    policyId: 1,
    ruleType: 'SPEND_THRESHOLD',
    thresholdValue: THRESHOLD,
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
];

const ALL_BANDS: AutonomyBand[] = ['PROBATION', 'SUPERVISED', 'TRUSTED'];

/** Every action type any agent in the system can emit. */
const ALL_ACTION_TYPES = [
  'gather_requirements',
  'request_quotations',
  'compare_vendors',
  'select_supplier',
  'commit_spend',
  'issue_purchase_order',
  'check_spend_threshold',
  'verify_vendor',
  'security_review',
];

/**
 * The action types that actually move money. Only these disburse funds when the
 * orchestrator executes them, so only these carry the spend threshold.
 *
 * `select_supplier` is deliberately NOT here: choosing a supplier proposes a
 * spend, it does not commit one (the commitment happens at `commit_spend`).
 * That is why golden-path step 4 is REVIEW rather than APPROVAL.
 */
const SPEND_COMMITTING_ACTIONS = ['commit_spend', 'issue_purchase_order'];

const agentIn = (autonomyBand: AutonomyBand): AgentState => ({
  id: 1,
  name: 'Test Agent',
  role: 'sourcing',
  autonomyBand,
  reputation: 99,
  approvedSpendCount: 99,
});

describe('INVARIANT: money over the policy threshold always reaches a human', () => {
  it('no band can ALLOW a spend-committing action over the threshold that nobody approved', () => {
    const leaks: string[] = [];

    for (const band of ALL_BANDS) {
      for (const actionType of SPEND_COMMITTING_ACTIONS) {
        const decision = evaluate(
          {
            agentId: 1,
            actionType,
            payload: { vendor: 'Dell', amount: 22400, currency: 'GBP' },
            riskClass: 'medium',
          },
          agentIn(band),
          rules,
          { priorApprovals: [] } // nothing has been approved by a human
        );

        if (decision.verdict === 'ALLOW') {
          leaks.push(`${band} / ${actionType} -> ALLOW`);
        }
      }
    }

    expect(leaks).toEqual([]);
  });

  it('every spend-committing action cites the rule that stopped it', () => {
    for (const band of ALL_BANDS) {
      for (const actionType of SPEND_COMMITTING_ACTIONS) {
        const decision = evaluate(
          {
            agentId: 1,
            actionType,
            payload: { vendor: 'Dell', amount: 22400, currency: 'GBP' },
            riskClass: 'medium',
          },
          agentIn(band),
          rules,
          { priorApprovals: [] }
        );

        expect(decision.ruleId, `${band}/${actionType}`).toBe(1);
        expect(decision.sourcePassage, `${band}/${actionType}`).toContain(
          'Finance Approval Matrix s2.1'
        );
      }
    }
  });

  it('an unapproved vendor is BLOCKed in every band, for every action type', () => {
    const leaks: string[] = [];

    for (const band of ALL_BANDS) {
      for (const actionType of ALL_ACTION_TYPES) {
        const decision = evaluate(
          {
            agentId: 1,
            actionType,
            payload: { vendor: 'CheapTech', amount: 500 },
            riskClass: 'low',
          },
          agentIn(band),
          rules,
          { priorApprovals: [] }
        );

        if (decision.verdict !== 'BLOCK') {
          leaks.push(`${band} / ${actionType} -> ${decision.verdict}`);
        }
      }
    }

    expect(leaks).toEqual([]);
  });

  it('a maxed-out TRUSTED agent still cannot commit over the threshold', () => {
    const decision = evaluate(
      {
        agentId: 1,
        actionType: 'commit_spend',
        payload: { vendor: 'Dell', amount: THRESHOLD },
        riskClass: 'high',
      },
      agentIn('TRUSTED'),
      rules,
      { priorApprovals: [] }
    );

    expect(decision.verdict).toBe('APPROVAL');
    expect(decision.ruleId).toBe(1);
    expect(decision.sourcePassage).toContain('Finance Approval Matrix s2.1');
  });
});

describe('INVARIANT: a purchase order may only execute a spend a human already approved', () => {
  it('BLOCKS the shortcut: a PO for money nobody ever approved needs approval', () => {
    const decision = evaluate(
      {
        agentId: 1,
        actionType: 'issue_purchase_order',
        payload: { vendor: 'Dell', amount: 22400, poNumber: 'PO-2026-001' },
        riskClass: 'medium',
      },
      agentIn('PROBATION'),
      rules,
      { priorApprovals: [] } // the agent skipped straight to the paperwork
    );

    expect(decision.verdict).not.toBe('ALLOW');
    expect(decision.verdict).toBe('APPROVAL');
  });

  it('ALLOWS the PO when a human approved exactly that vendor and amount', () => {
    const decision = evaluate(
      {
        agentId: 1,
        actionType: 'issue_purchase_order',
        payload: { vendor: 'Dell', amount: 22400, poNumber: 'PO-2026-001' },
        riskClass: 'medium',
      },
      agentIn('PROBATION'),
      rules,
      { priorApprovals: [{ actionType: 'commit_spend', vendor: 'Dell', amount: 22400 }] }
    );

    expect(decision.verdict).toBe('ALLOW');
  });

  it('does not let a PO inflate the amount a human approved', () => {
    const decision = evaluate(
      {
        agentId: 1,
        actionType: 'issue_purchase_order',
        payload: { vendor: 'Dell', amount: 30000, poNumber: 'PO-2026-001' },
        riskClass: 'medium',
      },
      agentIn('TRUSTED'),
      rules,
      { priorApprovals: [{ actionType: 'commit_spend', vendor: 'Dell', amount: 22400 }] } // approved 22,400, not 30,000
    );

    expect(decision.verdict).toBe('APPROVAL');
  });

  it('does not let a PO swap in a different vendor than the one approved', () => {
    const decision = evaluate(
      {
        agentId: 1,
        actionType: 'issue_purchase_order',
        payload: { vendor: 'HP', amount: 22400, poNumber: 'PO-2026-001' },
        riskClass: 'medium',
      },
      agentIn('TRUSTED'),
      rules,
      { priorApprovals: [{ actionType: 'commit_spend', vendor: 'Dell', amount: 22400 }] } // approved Dell, not HP
    );

    expect(decision.verdict).toBe('APPROVAL');
  });
});
