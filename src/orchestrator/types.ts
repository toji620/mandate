import type { ProposedAction, Decision, AgentState, AutonomyBand, PolicyRule } from '@/src/types';

export interface MissionConfig {
  goal: string;
  mode: 'live' | 'replay';
  initialContext?: Record<string, unknown>;
}

export interface MissionStep {
  stepNumber: number;
  agentRole: 'sourcing' | 'compliance' | 'procurement';
  proposal: ProposedAction;
  decision: Decision;
  agentStateBefore: AgentState;
  agentStateAfter: AgentState;
  /** Granite's plain-English gloss. Never the authoritative reason. */
  graniteExplanation?: string;
  /** Where the gloss came from, so the UI never passes off a fixture as Granite. */
  explanationSource?: 'granite' | 'fixture';
  timestamp: Date;
}

export interface MissionStatus {
  id: string;
  goal: string;
  mode: 'live' | 'replay';
  status: 'running' | 'paused' | 'completed' | 'failed';
  currentStep: number;
  steps: MissionStep[];
  pendingApprovals: PendingApproval[];
  context: Record<string, unknown>;
  /** The policy rules this mission is being judged against, held for its whole life. */
  rules: PolicyRule[];
  startedAt: Date;
  completedAt?: Date;
}

export interface PendingApproval {
  id: string;
  missionId: string;
  stepNumber: number;
  proposal: ProposedAction;
  decision: Decision;
  agentName: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface BandTransitionEvent {
  agentId: number;
  from: AutonomyBand;
  to: AutonomyBand;
  reason: string;
  stepNumber: number;
}
