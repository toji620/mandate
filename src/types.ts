// Core domain types for the evaluator

export type AutonomyBand = 'PROBATION' | 'SUPERVISED' | 'TRUSTED';
export type Verdict = 'ALLOW' | 'REVIEW' | 'APPROVAL' | 'BLOCK';
export type RuleType =
  | 'SPEND_THRESHOLD'
  | 'VENDOR_APPROVAL'
  | 'VENDOR_SUSPENSION'
  | 'SECURITY_REQUIREMENT';
export type EventType = 'PROMOTION' | 'DEMOTION' | 'CLEAN_ACTION';

export interface ProposedAction {
  agentId: number;
  actionType: string;
  payload: Record<string, unknown>;
  riskClass: string;
}

export interface AgentState {
  id: number;
  name: string;
  role: string;
  autonomyBand: AutonomyBand;
  /** Standing with the system: +1 per clean action, reset to 0 by a BLOCK. */
  reputation: number;
  approvedSpendCount: number;
}

export interface PolicyRule {
  id: number;
  policyId: number;
  ruleType: RuleType;
  thresholdValue?: number;
  currency?: string;
  appliesTo?: string;
  sourcePassage: string;
}

/**
 * An action a human has explicitly approved.
 *
 * `actionType` is load-bearing, not bookkeeping. Without it an approval records
 * only WHO and HOW MUCH, never WHAT — so approving a supplier CHOICE
 * ("select_supplier: HP, 22600") would satisfy a later request to SPEND the same
 * sum with the same vendor. A live agent walked through that hole; see
 * src/engine/authorization-scope.test.ts.
 */
export interface ApprovedCommitment {
  /** The action the human was actually shown when they approved. */
  actionType: string;
  vendor?: string;
  amount?: number;
}

/**
 * What the evaluator is told about approvals already granted in this mission.
 *
 * Supplied by the orchestrator, never self-reported by the agent — an agent
 * cannot claim its own spend was approved.
 */
export interface EvaluationContext {
  priorApprovals: ApprovedCommitment[];
}

export interface Decision {
  verdict: Verdict;
  ruleId?: number;
  explanation: string;
  sourcePassage?: string;
}

export interface BandTransition {
  from: AutonomyBand;
  to: AutonomyBand;
  reason: string;
}
