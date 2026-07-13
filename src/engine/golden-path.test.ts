import { describe, it, expect } from 'vitest';
import { evaluate, computeBandTransition } from './evaluate';
import type { AgentState, PolicyRule, AutonomyBand } from '@/src/types';
import { propose } from '@/src/agents/propose';

describe('Golden Path - 7-step procurement mission', () => {
  // Mock policy rules based on SPEC.md seed data
  const policyRules: PolicyRule[] = [
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

  it('should complete the full 7-step mission with correct verdicts and band transitions', async () => {
    // Initial agent state: PROBATION band
    const agentState: AgentState = {
      id: 1,
      name: 'Sourcing Agent',
      role: 'sourcing',
      autonomyBand: 'PROBATION',
      cleanActionCount: 0,
      approvedSpendCount: 0,
    };

    const results: Array<{
      step: number;
      actionType: string;
      verdict: string;
      bandBefore: AutonomyBand;
      bandAfter: AutonomyBand;
    }> = [];

    // Step 1: Gather requirements
    let proposal = await propose({ goal: 'Purchase laptops', currentStep: 1, agentState, context: {} }, 'replay');
    let decision = evaluate(proposal, agentState, policyRules);
    
    expect(decision.verdict).toBe('ALLOW');
    expect(agentState.autonomyBand).toBe('PROBATION');
    
    agentState.cleanActionCount++;
    results.push({
      step: 1,
      actionType: proposal.actionType,
      verdict: decision.verdict,
      bandBefore: 'PROBATION',
      bandAfter: agentState.autonomyBand,
    });

    // Step 2: Request quotations
    proposal = await propose({ goal: 'Purchase laptops', currentStep: 2, agentState, context: {} }, 'replay');
    decision = evaluate(proposal, agentState, policyRules);
    
    expect(decision.verdict).toBe('ALLOW');
    agentState.cleanActionCount++;
    results.push({
      step: 2,
      actionType: proposal.actionType,
      verdict: decision.verdict,
      bandBefore: agentState.autonomyBand,
      bandAfter: agentState.autonomyBand,
    });

    // Step 3: Compare approved vendors
    proposal = await propose({ goal: 'Purchase laptops', currentStep: 3, agentState, context: {} }, 'replay');
    decision = evaluate(proposal, agentState, policyRules);
    
    expect(decision.verdict).toBe('ALLOW');
    agentState.cleanActionCount++;
    
    // Check for promotion: PROBATION -> SUPERVISED after 3 clean actions (we need 5)
    results.push({
      step: 3,
      actionType: proposal.actionType,
      verdict: decision.verdict,
      bandBefore: agentState.autonomyBand,
      bandAfter: agentState.autonomyBand,
    });

    // Continue to accumulate clean actions for promotion
    agentState.cleanActionCount += 2; // Simulate 2 more clean actions to reach 5
    
    // Check for promotion
    let transition = computeBandTransition(agentState.autonomyBand, agentState.cleanActionCount, agentState.approvedSpendCount, false);
    if (transition) {
      agentState.autonomyBand = transition.to;
    }
    
    expect(agentState.autonomyBand).toBe('SUPERVISED');

    // Step 4: Select preferred supplier
    proposal = await propose({ goal: 'Purchase laptops', currentStep: 4, agentState, context: {} }, 'replay');
    decision = evaluate(proposal, agentState, policyRules);
    
    expect(decision.verdict).toBe('REVIEW');
    expect(agentState.autonomyBand).toBe('SUPERVISED');
    
    agentState.cleanActionCount++;
    results.push({
      step: 4,
      actionType: proposal.actionType,
      verdict: decision.verdict,
      bandBefore: 'SUPERVISED',
      bandAfter: agentState.autonomyBand,
    });

    // Step 5: Commit GBP 22,400 (exceeds threshold)
    proposal = await propose({ goal: 'Purchase laptops', currentStep: 5, agentState, context: {} }, 'replay');
    decision = evaluate(proposal, agentState, policyRules);
    
    expect(decision.verdict).toBe('APPROVAL');
    expect(decision.ruleId).toBe(1); // Finance Approval Matrix rule
    expect(decision.sourcePassage).toContain('Finance Approval Matrix s2.1');
    
    agentState.cleanActionCount++;
    agentState.approvedSpendCount++;
    results.push({
      step: 5,
      actionType: proposal.actionType,
      verdict: decision.verdict,
      bandBefore: agentState.autonomyBand,
      bandAfter: agentState.autonomyBand,
    });

    // Step 6: Use cheaper unapproved supplier (should BLOCK)
    proposal = await propose({ goal: 'Purchase laptops', currentStep: 6, agentState, context: {} }, 'replay');
    decision = evaluate(proposal, agentState, policyRules);
    
    expect(decision.verdict).toBe('BLOCK');
    expect(decision.explanation).toContain('not on the approved vendor list');
    
    // Demotion: SUPERVISED -> PROBATION
    transition = computeBandTransition(agentState.autonomyBand, agentState.cleanActionCount, agentState.approvedSpendCount, true);
    expect(transition).not.toBeNull();
    expect(transition?.from).toBe('SUPERVISED');
    expect(transition?.to).toBe('PROBATION');
    
    if (transition) {
      agentState.autonomyBand = transition.to;
    }
    
    results.push({
      step: 6,
      actionType: proposal.actionType,
      verdict: decision.verdict,
      bandBefore: 'SUPERVISED',
      bandAfter: 'PROBATION',
    });

    // Step 7: Issue purchase order (back in PROBATION)
    proposal = await propose({ goal: 'Purchase laptops', currentStep: 7, agentState, context: {} }, 'replay');
    decision = evaluate(proposal, agentState, policyRules);
    
    expect(decision.verdict).toBe('ALLOW');
    expect(agentState.autonomyBand).toBe('PROBATION');
    
    results.push({
      step: 7,
      actionType: proposal.actionType,
      verdict: decision.verdict,
      bandBefore: agentState.autonomyBand,
      bandAfter: agentState.autonomyBand,
    });

    // Verify the full chain
    expect(results).toHaveLength(7);
    expect(results[0].verdict).toBe('ALLOW');
    expect(results[1].verdict).toBe('ALLOW');
    expect(results[2].verdict).toBe('ALLOW');
    expect(results[3].verdict).toBe('REVIEW');
    expect(results[4].verdict).toBe('APPROVAL');
    expect(results[5].verdict).toBe('BLOCK');
    expect(results[6].verdict).toBe('ALLOW');
    
    // Verify band transitions
    expect(results[5].bandBefore).toBe('SUPERVISED');
    expect(results[5].bandAfter).toBe('PROBATION');
  });

  it('should promote PROBATION to SUPERVISED after 5 clean actions', () => {
    const transition = computeBandTransition('PROBATION', 5, 0, false);
    expect(transition).not.toBeNull();
    expect(transition?.from).toBe('PROBATION');
    expect(transition?.to).toBe('SUPERVISED');
  });

  it('should promote SUPERVISED to TRUSTED after 10 clean actions with 2 approved spends', () => {
    const transition = computeBandTransition('SUPERVISED', 10, 2, false);
    expect(transition).not.toBeNull();
    expect(transition?.from).toBe('SUPERVISED');
    expect(transition?.to).toBe('TRUSTED');
  });

  it('should demote TRUSTED to SUPERVISED on BLOCK', () => {
    const transition = computeBandTransition('TRUSTED', 10, 2, true);
    expect(transition).not.toBeNull();
    expect(transition?.from).toBe('TRUSTED');
    expect(transition?.to).toBe('SUPERVISED');
  });

  it('should demote SUPERVISED to PROBATION on BLOCK', () => {
    const transition = computeBandTransition('SUPERVISED', 5, 0, true);
    expect(transition).not.toBeNull();
    expect(transition?.from).toBe('SUPERVISED');
    expect(transition?.to).toBe('PROBATION');
  });
});
