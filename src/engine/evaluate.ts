import type { ProposedAction, AgentState, PolicyRule, Decision, AutonomyBand } from '@/src/types';

/**
 * Pure evaluator function - no I/O, no database, no LLM calls, no clock, no randomness.
 * Same inputs always produce the same Decision.
 * 
 * Rule precedence (most restrictive wins):
 * 1. BLOCK (unapproved vendor, missing security requirements)
 * 2. APPROVAL (spend threshold exceeded)
 * 3. REVIEW (commercial actions in SUPERVISED band)
 * 4. ALLOW (within policy and band constraints)
 */
export function evaluate(
  action: ProposedAction,
  agentState: AgentState,
  rules: PolicyRule[]
): Decision {
  // BLOCK checks first - these override everything
  
  // Check for unapproved vendor usage (always blocks regardless of band)
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

  // Check for missing security requirements
  const requiresSecurityReview = action.payload.requiresSecurityReview as boolean | undefined;
  const hasSecurityReview = action.payload.hasSecurityReview as boolean | undefined;
  
  if (requiresSecurityReview === true && hasSecurityReview !== true) {
    const securityRule = rules.find(r => r.ruleType === 'SECURITY_REQUIREMENT');
    return {
      verdict: 'BLOCK',
      ruleId: securityRule?.id,
      explanation: 'Action requires security review but none has been completed',
      sourcePassage: securityRule?.sourcePassage || 'Security requirements must be met',
    };
  }

  // Apply autonomy band constraints (band-specific rules checked before spend thresholds)
  if (agentState.autonomyBand === 'PROBATION') {
    // In PROBATION, low-risk read actions are allowed
    if (action.riskClass === 'low' && 
        (action.actionType === 'gather_requirements' || 
         action.actionType === 'request_quotations' || 
         action.actionType === 'compare_vendors')) {
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
    // Low-risk actions auto-allowed
    if (action.riskClass === 'low' || 
        action.actionType === 'gather_requirements' || 
        action.actionType === 'request_quotations' || 
        action.actionType === 'compare_vendors') {
      return {
        verdict: 'ALLOW',
        explanation: 'Low-risk action auto-allowed in SUPERVISED band',
      };
    }
    
    // Supplier selection needs review (confirmation) - checked before spend threshold
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
        r => r.ruleType === 'SPEND_THRESHOLD' && 
             r.thresholdValue !== undefined &&
             spendAmount >= r.thresholdValue
      );
      
      if (spendRule) {
        return {
          verdict: 'APPROVAL',
          ruleId: spendRule.id,
          explanation: `Spend amount ${spendAmount} ${spendRule.currency || 'GBP'} meets or exceeds threshold of ${spendRule.thresholdValue} ${spendRule.currency || 'GBP'}`,
          sourcePassage: spendRule.sourcePassage,
        };
      }
    }
    
    // Commercial actions with spend (but below threshold) need review
    if (action.riskClass === 'high' || action.riskClass === 'medium') {
      return {
        verdict: 'REVIEW',
        explanation: 'Commercial action requires review in SUPERVISED band',
      };
    }
  }

  if (agentState.autonomyBand === 'TRUSTED') {
    // Check spend thresholds
    const spendAmount = action.payload.amount as number | undefined;
    if (spendAmount !== undefined) {
      const spendRule = rules.find(
        r => r.ruleType === 'SPEND_THRESHOLD' && 
             r.thresholdValue !== undefined &&
             spendAmount >= r.thresholdValue
      );
      
      if (spendRule) {
        return {
          verdict: 'APPROVAL',
          ruleId: spendRule.id,
          explanation: `Spend amount ${spendAmount} ${spendRule.currency || 'GBP'} meets or exceeds threshold of ${spendRule.thresholdValue} ${spendRule.currency || 'GBP'}`,
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
 * Ledger event for band computation
 */
export interface LedgerEvent {
  eventType: 'PROMOTION' | 'DEMOTION' | 'CLEAN_ACTION';
  verdict?: 'ALLOW' | 'REVIEW' | 'APPROVAL' | 'BLOCK';
  bandBefore: AutonomyBand;
  bandAfter: AutonomyBand;
  isSpendAction?: boolean;
  createdAt: Date;
}

/**
 * Computes the current autonomy band from trust ledger history.
 * Pure function - deterministic based on ledger events.
 * 
 * Rules:
 * - All agents start at PROBATION
 * - 5 clean approved actions promote PROBATION -> SUPERVISED
 * - 10 clean actions including 2 approved spend events promote SUPERVISED -> TRUSTED
 * - Any BLOCK demotes exactly one band instantly
 * - Clean action counts carry across demotions (agent can re-earn promotion)
 * 
 * @param ledgerEvents - Chronologically ordered ledger events (oldest first)
 * @returns Current autonomy band and action counts
 */
export function computeBand(ledgerEvents: LedgerEvent[]): {
  currentBand: AutonomyBand;
  cleanActionCount: number;
  approvedSpendCount: number;
} {
  let currentBand: AutonomyBand = 'PROBATION';
  let cleanActionCount = 0;
  let approvedSpendCount = 0;

  for (const event of ledgerEvents) {
    if (event.eventType === 'CLEAN_ACTION') {
      cleanActionCount++;
      
      // Track approved spend actions
      if (event.isSpendAction && (event.verdict === 'APPROVAL' || event.verdict === 'ALLOW')) {
        approvedSpendCount++;
      }
      
      // Check for promotion: PROBATION -> SUPERVISED after 5 clean actions
      if (currentBand === 'PROBATION' && cleanActionCount >= 5) {
        currentBand = 'SUPERVISED';
      }
      
      // Check for promotion: SUPERVISED -> TRUSTED after 10 clean actions with 2 approved spends
      if (currentBand === 'SUPERVISED' && cleanActionCount >= 10 && approvedSpendCount >= 2) {
        currentBand = 'TRUSTED';
      }
    } else if (event.eventType === 'DEMOTION') {
      // Demote exactly one band
      if (currentBand === 'TRUSTED') {
        currentBand = 'SUPERVISED';
      } else if (currentBand === 'SUPERVISED') {
        currentBand = 'PROBATION';
      }
      // Note: Clean action counts carry across demotions - agent can re-earn promotion
    } else if (event.eventType === 'PROMOTION') {
      // Explicit promotion event (should match computed promotion above)
      currentBand = event.bandAfter;
    }
  }

  return { currentBand, cleanActionCount, approvedSpendCount };
}

/**
 * Legacy function for backward compatibility with existing tests.
 * Computes a single band transition based on current state.
 * 
 * @deprecated Use computeBand() with full ledger history instead
 */
export function computeBandTransition(
  currentBand: AutonomyBand,
  cleanActionCount: number,
  approvedSpendCount: number,
  wasBlocked: boolean
): { from: AutonomyBand; to: AutonomyBand; reason: string } | null {
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