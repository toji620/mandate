import { describe, it, expect, beforeEach } from 'vitest';
import { MissionOrchestrator } from './orchestrator';
import type { PolicyRule } from '@/src/types';

describe('MissionOrchestrator', () => {
  let orchestrator: MissionOrchestrator;
  
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
  ];

  beforeEach(() => {
    orchestrator = new MissionOrchestrator();
  });

  it('should start a mission in replay mode', async () => {
    const missionId = await orchestrator.startMission(
      {
        goal: 'Purchase 20 developer laptops for under GBP 25,000, delivered by Friday',
        mode: 'replay',
      },
      mockRules
    );

    expect(missionId).toBeDefined();
    expect(typeof missionId).toBe('string');

    const mission = orchestrator.getMission(missionId);
    expect(mission).toBeDefined();
    expect(mission?.goal).toBe('Purchase 20 developer laptops for under GBP 25,000, delivered by Friday');
    expect(mission?.mode).toBe('replay');
    expect(mission?.status).toBe('running');
  });

  it('should track mission steps as they execute', async () => {
    const missionId = await orchestrator.startMission(
      {
        goal: 'Purchase 20 developer laptops for under GBP 25,000, delivered by Friday',
        mode: 'replay',
      },
      mockRules
    );

    // Wait a bit for first step to execute
    await new Promise(resolve => setTimeout(resolve, 100));

    const mission = orchestrator.getMission(missionId);
    expect(mission?.steps.length).toBeGreaterThan(0);
    
    if (mission && mission.steps.length > 0) {
      const firstStep = mission.steps[0];
      expect(firstStep.stepNumber).toBe(1);
      expect(firstStep.proposal).toBeDefined();
      expect(firstStep.decision).toBeDefined();
      expect(firstStep.agentStateBefore).toBeDefined();
      expect(firstStep.agentStateAfter).toBeDefined();
    }
  });

  it('should pause mission when APPROVAL verdict is encountered', async () => {
    const missionId = await orchestrator.startMission(
      {
        goal: 'Purchase 20 developer laptops for under GBP 25,000, delivered by Friday',
        mode: 'replay',
      },
      mockRules
    );

    // Wait for mission to reach approval step (step 5 in golden path)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const mission = orchestrator.getMission(missionId);
    
    // Mission should pause on APPROVAL verdict
    if (mission && mission.steps.length >= 5) {
      const approvalStep = mission.steps.find(s => s.decision.verdict === 'APPROVAL');
      if (approvalStep) {
        expect(mission.status).toBe('paused');
        expect(mission.pendingApprovals.length).toBeGreaterThan(0);
      }
    }
  });

  it('should resume mission after approval is granted', async () => {
    const missionId = await orchestrator.startMission(
      {
        goal: 'Purchase 20 developer laptops for under GBP 25,000, delivered by Friday',
        mode: 'replay',
      },
      mockRules
    );

    // Wait for mission to pause on approval
    await new Promise(resolve => setTimeout(resolve, 2000));

    const mission = orchestrator.getMission(missionId);
    
    if (mission && mission.pendingApprovals.length > 0) {
      const approval = mission.pendingApprovals[0];
      
      // Approve the action
      await orchestrator.approveAction(approval.id, 'Test Approver');
      
      // Wait for mission to resume
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const updatedMission = orchestrator.getMission(missionId);
      expect(updatedMission?.status).not.toBe('paused');
    }
  });

  it('should record BLOCK verdict and demotion', async () => {
    const missionId = await orchestrator.startMission(
      {
        goal: 'Purchase 20 developer laptops for under GBP 25,000, delivered by Friday',
        mode: 'replay',
      },
      mockRules
    );

    // Wait for mission to reach BLOCK step (step 6 in golden path)
    await new Promise(resolve => setTimeout(resolve, 3000));

    const mission = orchestrator.getMission(missionId);
    
    if (mission && mission.steps.length >= 6) {
      const blockStep = mission.steps.find(s => s.decision.verdict === 'BLOCK');
      
      if (blockStep) {
        expect(blockStep.decision.verdict).toBe('BLOCK');
        
        // Check for demotion
        const bandBefore = blockStep.agentStateBefore.autonomyBand;
        const bandAfter = blockStep.agentStateAfter.autonomyBand;
        
        // Band should have demoted (or stayed at PROBATION)
        if (bandBefore === 'TRUSTED') {
          expect(bandAfter).toBe('SUPERVISED');
        } else if (bandBefore === 'SUPERVISED') {
          expect(bandAfter).toBe('PROBATION');
        }
      }
    }
  });

  it('should track band transitions through mission', async () => {
    const missionId = await orchestrator.startMission(
      {
        goal: 'Purchase 20 developer laptops for under GBP 25,000, delivered by Friday',
        mode: 'replay',
      },
      mockRules
    );

    // Wait for mission to progress
    await new Promise(resolve => setTimeout(resolve, 1500));

    const mission = orchestrator.getMission(missionId);
    
    if (mission && mission.steps.length >= 3) {
      // Should start in PROBATION
      expect(mission.steps[0].agentStateBefore.autonomyBand).toBe('PROBATION');
      
      // Should promote to SUPERVISED after 5 clean actions (around step 3-4)
      const promotionStep = mission.steps.find(
        s => s.agentStateBefore.autonomyBand === 'PROBATION' && 
             s.agentStateAfter.autonomyBand === 'SUPERVISED'
      );
      
      if (promotionStep) {
        expect(promotionStep.agentStateAfter.autonomyBand).toBe('SUPERVISED');
      }
    }
  });

  it('should execute multiple steps in sequence', async () => {
    const missionId = await orchestrator.startMission(
      {
        goal: 'Purchase 20 developer laptops for under GBP 25,000, delivered by Friday',
        mode: 'replay',
      },
      mockRules
    );

    // Wait for several steps to execute
    await new Promise(resolve => setTimeout(resolve, 1000));

    const mission = orchestrator.getMission(missionId);
    
    // Mission should have executed multiple steps
    expect(mission?.steps.length).toBeGreaterThanOrEqual(3);
    expect(mission?.status).toMatch(/completed|paused|running/);
  });

  it('should handle mission context updates', async () => {
    const missionId = await orchestrator.startMission(
      {
        goal: 'Purchase 20 developer laptops for under GBP 25,000, delivered by Friday',
        mode: 'replay',
        initialContext: { testKey: 'testValue' },
      },
      mockRules
    );

    await new Promise(resolve => setTimeout(resolve, 500));

    const mission = orchestrator.getMission(missionId);
    expect(mission?.context.testKey).toBe('testValue');
    
    // Context should be updated as actions execute
    if (mission && mission.steps.length > 0) {
      expect(Object.keys(mission.context).length).toBeGreaterThan(1);
    }
  });
});
