import type { ProposedAction, AgentState, PolicyRule, Decision, AutonomyBand, BandTransition } from '@/src/types';

/**
 * Pure evaluator function - no I/O, no database, no LLM calls, no clock, no randomness.
 * Same inputs always produce the same Decision.
 */
export function evaluate(
  action: ProposedAction,
  agentState: AgentState,
  rules: PolicyRule[]
): Decision {
  // Check for unapproved vendor usage FIRST (always blocks regardless of band)
  const vendor = action.payload.vendor as string | undefined;
  if (vendor !== undefined) {
    const approvedVendors = rules
      .filter(r => r.ruleType === 'VENDOR_APPROVAL')
      .map(r => r.appliesTo);
    
    if (approvedVendors.length > 0 && !approvedVendors.includes(vendor)) {
      const blockRule = rules.find(r => r.ruleType === 'VENDOR_APPROVAL');
      return {
        verdict: 'BLOCK',
        ruleId: blockRule?.id,
        explanation: `Vendor "${vendor}" is not on the approved vendor list`,
        sourcePassage: blockRule?.sourcePassage || 'Approved vendor list',
      };
    }
  }

  // Apply autonomy band constraints BEFORE spend thresholds
  if (agentState.autonomyBand === 'PROBATION') {
    // In PROBATION, low-risk read actions and administrative actions are allowed
    if (action.riskClass === 'low' && (action.actionType === 'gather_requirements' || action.actionType === 'request_quotations' || action.actionType === 'compare_vendors')) {
      return {
        verdict: 'ALLOW',
        explanation: 'Low-risk information gathering allowed in PROBATION band',
      };
    }
    // Administrative actions like issuing POs (executing on approved decisions) are allowed
    if (action.actionType === 'issue_purchase_order') {
      return {
        verdict: 'ALLOW',
        explanation: 'Administrative action executing approved decision',
      };
    }
    // Everything else requires approval in PROBATION
    return {
      verdict: 'APPROVAL',
      explanation: 'Agent is in PROBATION band - action requires approval',
    };
  }

  if (agentState.autonomyBand === 'SUPERVISED') {
    // Low-risk actions auto-allowed; anything with commercial effect requires approval
    if (action.riskClass === 'low' || action.actionType === 'gather_requirements' || action.actionType === 'request_quotations' || action.actionType === 'compare_vendors') {
      return {
        verdict: 'ALLOW',
        explanation: 'Low-risk action auto-allowed in SUPERVISED band',
      };
    }
    
    // Supplier selection needs review (confirmation)
    if (action.actionType === 'select_supplier') {
      return {
        verdict: 'REVIEW',
        explanation: 'Supplier selection requires review in SUPERVISED band',
      };
    }
    
    // Check spend thresholds for commercial actions
    const spendAmount = action.payload.amount as number | undefined;
    if (spendAmount !== undefined) {
      const spendRule = rules.find(
        r => r.ruleType === 'SPEND_THRESHOLD' && r.thresholdValue !== undefined
      );
      
      if (spendRule && spendAmount >= spendRule.thresholdValue!) {
        return {
          verdict: 'APPROVAL',
          ruleId: spendRule.id,
          explanation: `Spend amount ${spendAmount} ${spendRule.currency || 'GBP'} exceeds threshold of ${spendRule.thresholdValue} ${spendRule.currency || 'GBP'}`,
          sourcePassage: spendRule.sourcePassage,
        };
      }
    }
  }

  if (agentState.autonomyBand === 'TRUSTED') {
    // Check spend thresholds
    const spendAmount = action.payload.amount as number | undefined;
    if (spendAmount !== undefined) {
      const spendRule = rules.find(
        r => r.ruleType === 'SPEND_THRESHOLD' && r.thresholdValue !== undefined
      );
      
      if (spendRule && spendAmount >= spendRule.thresholdValue!) {
        return {
          verdict: 'APPROVAL',
          ruleId: spendRule.id,
          explanation: `Spend amount ${spendAmount} ${spendRule.currency || 'GBP'} exceeds threshold of ${spendRule.thresholdValue} ${spendRule.currency || 'GBP'}`,
          sourcePassage: spendRule.sourcePassage,
        };
      }
    }
    
    // Auto-allowed up to policy thresholds
    return {
      verdict: 'ALLOW',
      explanation: 'Action auto-allowed in TRUSTED band within policy limits',
    };
  }

  // Default: allow low-risk actions
  return {
    verdict: 'ALLOW',
    explanation: 'Action approved',
  };
}

/**
 * Computes band transitions based on agent history.
 * Pure function - deterministic based on inputs.
 */
export function computeBandTransition(
  currentBand: AutonomyBand,
  cleanActionCount: number,
  approvedSpendCount: number,
  wasBlocked: boolean
): BandTransition | null {
  // Demotion: any BLOCK demotes exactly one band
  if (wasBlocked) {
    if (currentBand === 'TRUSTED') {
      return { from: 'TRUSTED', to: 'SUPERVISED', reason: 'Blocked action triggered demotion' };
    }
    if (currentBand === 'SUPERVISED') {
      return { from: 'SUPERVISED', to: 'PROBATION', reason: 'Blocked action triggered demotion' };
    }
    // Already at PROBATION, can't demote further
    return null;
  }

  // Promotion: PROBATION -> SUPERVISED after 5 clean actions
  if (currentBand === 'PROBATION' && cleanActionCount >= 5) {
    return { from: 'PROBATION', to: 'SUPERVISED', reason: '5 clean actions completed' };
  }

  // Promotion: SUPERVISED -> TRUSTED after 10 clean actions including 2 approved spends
  if (currentBand === 'SUPERVISED' && cleanActionCount >= 10 && approvedSpendCount >= 2) {
    return { from: 'SUPERVISED', to: 'TRUSTED', reason: '10 clean actions including 2 approved spends' };
  }

  return null;
}
