// Core domain types for the evaluator

export type AutonomyBand = 'PROBATION' | 'SUPERVISED' | 'TRUSTED';
export type Verdict = 'ALLOW' | 'REVIEW' | 'APPROVAL' | 'BLOCK';
export type RuleType = 'SPEND_THRESHOLD' | 'VENDOR_APPROVAL' | 'SECURITY_REQUIREMENT';
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

/** A spend a human has explicitly approved. */
export interface ApprovedCommitment {
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
