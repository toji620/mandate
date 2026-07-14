import { describe, it, expect } from 'vitest';
import { computeBand, evaluate, SPEND_COMMITTING_ACTIONS, type LedgerEvent } from './evaluate';
import { propose } from '@/src/agents/propose';
import type {
  ApprovedCommitment,
  AutonomyBand,
  Decision,
  PolicyRule,
  Verdict,
} from '@/src/types';

/**
 * The golden path (SPEC.md): purchase 20 developer laptops for under GBP 25,000,
 * delivered by Friday.
 *
 * This walks the mission exactly as the orchestrator does — deriving the band
 * from the trust ledger before each step, and feeding human approvals back in as
 * they are granted. Nothing is simulated or nudged. If the engine cannot produce
 * this table on its own, the test fails.
 *
 * Runs with no database and no network: proposals come from replay fixtures.
 */

const policyRules: PolicyRule[] = [
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
    sourcePassage: 'Approved Vendor List: Dell is an approved supplier for IT equipment',
  },
  {
    id: 3,
    policyId: 2,
    ruleType: 'VENDOR_APPROVAL',
    appliesTo: 'HP',
    sourcePassage: 'Approved Vendor List: HP is an approved supplier for IT equipment',
  },
  {
    id: 4,
    policyId: 2,
    ruleType: 'VENDOR_APPROVAL',
    appliesTo: 'Lenovo',
    sourcePassage: 'Approved Vendor List: Lenovo is an approved supplier for IT equipment',
  },
];

interface StepResult {
  step: number;
  actionType: string;
  verdict: Verdict;
  bandBefore: AutonomyBand;
  bandAfter: AutonomyBand;
  decision: Decision;
}

/**
 * Replays the seven-step mission through the real engine.
 *
 * `approveEverything` mirrors the demo: a human approves each REVIEW/APPROVAL
 * that comes their way. BLOCK is not approvable — it never reaches a human.
 */
async function runGoldenPath(): Promise<StepResult[]> {
  const ledger: LedgerEvent[] = [];
  const priorApprovals: ApprovedCommitment[] = [];
  const results: StepResult[] = [];

  for (let step = 1; step <= 7; step++) {
    const bandBefore = computeBand(ledger).currentBand;
    const bandState = computeBand(ledger);

    const proposal = await propose(
      {
        goal: 'Purchase 20 developer laptops for under GBP 25,000, delivered by Friday',
        currentStep: step,
        agentState: {
          id: 1,
          name: 'Sourcing Agent',
          role: 'sourcing',
          autonomyBand: bandBefore,
          reputation: bandState.reputation,
          approvedSpendCount: bandState.approvedSpendCount,
        },
        context: {},
      },
      'replay'
    );

    const decision = evaluate(
      proposal,
      {
        id: 1,
        name: 'Sourcing Agent',
        role: 'sourcing',
        autonomyBand: bandBefore,
        reputation: bandState.reputation,
        approvedSpendCount: bandState.approvedSpendCount,
      },
      policyRules,
      { priorApprovals }
    );

    if (decision.verdict === 'BLOCK') {
      ledger.push({
        eventType: 'DEMOTION',
        verdict: 'BLOCK',
        bandBefore,
        bandAfter: computeBand([...ledger, dummyDemotion(bandBefore)]).currentBand,
        createdAt: new Date('2026-07-14'),
      });
    } else {
      // REVIEW and APPROVAL reach a human, who approves. ALLOW just runs.
      if (decision.verdict === 'REVIEW' || decision.verdict === 'APPROVAL') {
        priorApprovals.push({
          vendor: proposal.payload.vendor as string | undefined,
          amount: proposal.payload.amount as number | undefined,
        });
      }

      ledger.push({
        eventType: 'CLEAN_ACTION',
        verdict: decision.verdict,
        bandBefore,
        bandAfter: bandBefore,
        isSpendAction: SPEND_COMMITTING_ACTIONS.includes(proposal.actionType),
        createdAt: new Date('2026-07-14'),
      });
    }

    results.push({
      step,
      actionType: proposal.actionType,
      verdict: decision.verdict,
      bandBefore,
      bandAfter: computeBand(ledger).currentBand,
      decision,
    });
  }

  return results;
}

/** Helper so the DEMOTION event can record the band it lands on. */
function dummyDemotion(bandBefore: AutonomyBand): LedgerEvent {
  return {
    eventType: 'DEMOTION',
    verdict: 'BLOCK',
    bandBefore,
    bandAfter: bandBefore,
    createdAt: new Date('2026-07-14'),
  };
}

describe('Golden Path - 7-step procurement mission', () => {
  it('produces exactly the verdicts and band transitions SPEC.md requires', async () => {
    const r = await runGoldenPath();

    // Step 1 — gather requirements. A brand-new agent may read.
    expect(r[0].actionType).toBe('gather_requirements');
    expect(r[0].verdict).toBe('ALLOW');
    expect(r[0].bandBefore).toBe('PROBATION');

    // Step 2 — request quotations.
    expect(r[1].verdict).toBe('ALLOW');
    expect(r[1].bandAfter).toBe('PROBATION');

    // Step 3 — compare approved vendors. Reputation reaches the bar: promotion.
    expect(r[2].verdict).toBe('ALLOW');
    expect(r[2].bandBefore).toBe('PROBATION');
    expect(r[2].bandAfter).toBe('SUPERVISED');

    // Step 4 — select preferred supplier. Commercial, so SUPERVISED wants a look.
    expect(r[3].actionType).toBe('select_supplier');
    expect(r[3].verdict).toBe('REVIEW');
    expect(r[3].bandBefore).toBe('SUPERVISED');

    // Step 5 — commit GBP 22,400. Over the threshold: a human must sign, and the
    // decision must cite the rule that says so.
    expect(r[4].actionType).toBe('commit_spend');
    expect(r[4].verdict).toBe('APPROVAL');
    expect(r[4].decision.ruleId).toBe(1);
    expect(r[4].decision.sourcePassage).toContain('Finance Approval Matrix s2.1');

    // Step 6 — the cheaper unapproved supplier. This is the whole product.
    expect(r[5].verdict).toBe('BLOCK');
    expect(r[5].decision.explanation).toContain('not on the approved vendor list');
    expect(r[5].decision.sourcePassage).toContain('Approved Vendor List');
    expect(r[5].bandBefore).toBe('SUPERVISED');
    expect(r[5].bandAfter).toBe('PROBATION');

    // Step 7 — issue the purchase order. Allowed because it merely executes the
    // GBP 22,400 commitment a human approved at step 5 — not because purchase
    // orders are waved through.
    expect(r[6].actionType).toBe('issue_purchase_order');
    expect(r[6].verdict).toBe('ALLOW');
    expect(r[6].decision.explanation).toContain('already approved');
  });

  it('keeps the agent demoted after the BLOCK — the demotion does not evaporate', async () => {
    const r = await runGoldenPath();

    // This is the regression guard. Before the reputation reset, the agent
    // bounced straight back to SUPERVISED on step 7 and the demo showed a
    // PROMOTION seconds after the agent was caught cheating.
    expect(r[6].bandBefore).toBe('PROBATION');
    expect(r[6].bandAfter).toBe('PROBATION');
  });

  it('never lets money over the threshold through without a human', async () => {
    const r = await runGoldenPath();

    const unapprovedSpends = r.filter(
      (s) =>
        SPEND_COMMITTING_ACTIONS.includes(s.actionType) &&
        s.verdict === 'ALLOW' &&
        !s.decision.explanation.includes('already approved')
    );

    expect(unapprovedSpends).toEqual([]);
  });

  it('cites a source passage on every decision that was not a plain allow', async () => {
    const r = await runGoldenPath();

    for (const step of r) {
      if (step.verdict === 'BLOCK' || step.verdict === 'APPROVAL') {
        expect(step.decision.sourcePassage, `step ${step.step}`).toBeTruthy();
        expect(step.decision.ruleId, `step ${step.step}`).toBeDefined();
      }
    }
  });
});
