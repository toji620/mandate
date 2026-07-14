import { describe, it, expect, beforeEach } from 'vitest';
import { MissionOrchestrator } from './orchestrator';
import type { PolicyRule } from '@/src/types';
import type { MissionStatus } from './types';

const GOAL = 'Purchase 20 developer laptops for under GBP 25,000, delivered by Friday';

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
    policyId: 2,
    ruleType: 'VENDOR_APPROVAL',
    appliesTo: 'Lenovo',
    sourcePassage: 'Approved Vendor List: Lenovo is an approved supplier',
  },
];

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

/**
 * Plays the human: approves every request the mission raises, until the mission
 * finishes. Polls rather than sleeping a fixed time, so the test is not a race.
 */
async function runToCompletion(
  orchestrator: MissionOrchestrator,
  missionId: string
): Promise<MissionStatus> {
  for (let i = 0; i < 500; i++) {
    const mission = orchestrator.getMission(missionId);
    if (!mission) throw new Error('mission vanished');

    if (mission.status === 'completed' || mission.status === 'failed') return mission;

    const pending = orchestrator.getMissionApprovals(missionId);
    for (const approval of pending) {
      await orchestrator.approveAction(approval.id, 'Finance Director');
    }

    await tick();
  }

  throw new Error('mission did not finish');
}

describe('MissionOrchestrator', () => {
  let orchestrator: MissionOrchestrator;

  beforeEach(() => {
    orchestrator = new MissionOrchestrator();
  });

  it('starts a mission in replay mode', async () => {
    const missionId = await orchestrator.startMission({ goal: GOAL, mode: 'replay' }, mockRules);
    const mission = orchestrator.getMission(missionId);

    expect(mission?.goal).toBe(GOAL);
    expect(mission?.mode).toBe('replay');
  });

  it('runs the full golden path to completion when the human approves', async () => {
    const missionId = await orchestrator.startMission({ goal: GOAL, mode: 'replay' }, mockRules);
    const mission = await runToCompletion(orchestrator, missionId);

    expect(mission.status).toBe('completed');
    expect(mission.steps.map((s) => s.decision.verdict)).toEqual([
      'ALLOW', // 1. gather requirements
      'ALLOW', // 2. request quotations
      'ALLOW', // 3. compare approved vendors
      'REVIEW', // 4. select preferred supplier
      'APPROVAL', // 5. commit GBP 22,400
      'BLOCK', // 6. cheaper unapproved supplier
      'ALLOW', // 7. issue the purchase order
    ]);
  });

  it('pauses for a human on REVIEW and APPROVAL', async () => {
    const missionId = await orchestrator.startMission({ goal: GOAL, mode: 'replay' }, mockRules);

    for (let i = 0; i < 200; i++) {
      const mission = orchestrator.getMission(missionId);
      if (mission?.status === 'paused') {
        expect(orchestrator.getMissionApprovals(missionId).length).toBeGreaterThan(0);
        return;
      }
      await tick();
    }

    throw new Error('mission never paused for a human');
  });

  // Regression: approving used to spawn a SECOND execution loop alongside the
  // one already parked on the approval, so steps ran twice.
  it('runs each step exactly once, even across approvals', async () => {
    const missionId = await orchestrator.startMission({ goal: GOAL, mode: 'replay' }, mockRules);
    const mission = await runToCompletion(orchestrator, missionId);

    const stepNumbers = mission.steps.map((s) => s.stepNumber);

    expect(stepNumbers).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(stepNumbers).size).toBe(stepNumbers.length);
  });

  // Regression: the resume path used to re-enter the loop with an EMPTY rules
  // array, so after any approval the policy checks silently stopped firing and
  // the unapproved vendor at step 6 sailed through.
  it('still enforces policy on the steps that come after an approval', async () => {
    const missionId = await orchestrator.startMission({ goal: GOAL, mode: 'replay' }, mockRules);
    const mission = await runToCompletion(orchestrator, missionId);

    const blocked = mission.steps.find((s) => s.decision.verdict === 'BLOCK');

    expect(blocked).toBeDefined();
    expect(blocked!.stepNumber).toBe(6); // comes after two human approvals
    expect(blocked!.proposal.payload.vendor).toBe('CheapTech');
    expect(blocked!.decision.explanation).toContain('not on the approved vendor list');
  });

  it('promotes the agent to SUPERVISED once it has earned the reputation', async () => {
    const missionId = await orchestrator.startMission({ goal: GOAL, mode: 'replay' }, mockRules);
    const mission = await runToCompletion(orchestrator, missionId);

    const promotion = mission.steps.find(
      (s) =>
        s.agentStateBefore.autonomyBand === 'PROBATION' &&
        s.agentStateAfter.autonomyBand === 'SUPERVISED'
    );

    expect(promotion).toBeDefined();
    expect(promotion!.stepNumber).toBe(3);
  });

  it('demotes the agent on the BLOCK, and the demotion sticks', async () => {
    const missionId = await orchestrator.startMission({ goal: GOAL, mode: 'replay' }, mockRules);
    const mission = await runToCompletion(orchestrator, missionId);

    const blocked = mission.steps[5];
    expect(blocked.agentStateBefore.autonomyBand).toBe('SUPERVISED');
    expect(blocked.agentStateAfter.autonomyBand).toBe('PROBATION');
    expect(blocked.agentStateAfter.reputation).toBe(0);

    // The step after the block must NOT bounce the agent back up.
    const afterBlock = mission.steps[6];
    expect(afterBlock.agentStateBefore.autonomyBand).toBe('PROBATION');
    expect(afterBlock.agentStateAfter.autonomyBand).toBe('PROBATION');
  });

  it('fails the mission when a human rejects', async () => {
    const missionId = await orchestrator.startMission({ goal: GOAL, mode: 'replay' }, mockRules);

    for (let i = 0; i < 200; i++) {
      const pending = orchestrator.getMissionApprovals(missionId);
      if (pending.length > 0) {
        await orchestrator.rejectAction(pending[0].id, 'Finance Director');
        break;
      }
      await tick();
    }

    for (let i = 0; i < 200; i++) {
      const mission = orchestrator.getMission(missionId);
      if (mission?.status === 'failed') {
        expect(mission.status).toBe('failed');
        return;
      }
      await tick();
    }

    throw new Error('mission did not fail after rejection');
  });

  it('records the purchase order as executing an already-approved commitment', async () => {
    const missionId = await orchestrator.startMission({ goal: GOAL, mode: 'replay' }, mockRules);
    const mission = await runToCompletion(orchestrator, missionId);

    const po = mission.steps[6];
    expect(po.proposal.actionType).toBe('issue_purchase_order');
    expect(po.decision.verdict).toBe('ALLOW');
    expect(po.decision.explanation).toContain('already approved');
    expect(mission.context.purchaseOrder).toBeDefined();
  });

  it('carries the initial context through the mission', async () => {
    const missionId = await orchestrator.startMission(
      { goal: GOAL, mode: 'replay', initialContext: { testKey: 'testValue' } },
      mockRules
    );
    const mission = await runToCompletion(orchestrator, missionId);

    expect(mission.context.testKey).toBe('testValue');
    expect(mission.context.committedVendor).toBe('Dell');
  });
});
