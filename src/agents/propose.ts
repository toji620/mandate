import type { ProposedAction, AgentState } from '@/src/types';
import { proposeLive as proposeLiveAgent, type AgentRole } from './agents';

export interface MissionState {
  goal: string;
  currentStep: number;
  agentState: AgentState;
  context: Record<string, unknown>;
}

export type ProposalMode = 'live' | 'replay';

/**
 * Agent proposal interface.
 * Two implementations: 'live' (Granite via watsonx.ai SDK) and 'replay' (fixtures).
 */
export async function propose(
  missionState: MissionState,
  mode: ProposalMode = 'replay',
  role?: AgentRole
): Promise<ProposedAction> {
  if (mode === 'replay') {
    return proposeReplay(missionState);
  }
  
  // Live mode requires a role
  if (!role) {
    throw new Error('Live mode requires an agent role to be specified');
  }
  
  return proposeLiveAgent(role, missionState, missionState.agentState);
}

/**
 * Replay mode: serves recorded proposal fixtures from data/fixtures/
 */
async function proposeReplay(missionState: MissionState): Promise<ProposedAction> {
  // Dynamic import to avoid bundling fixtures in production
  const fixtures = await import('@/data/fixtures/golden-path-proposals.json');
  
  const proposal = fixtures.proposals[missionState.currentStep - 1];
  
  if (!proposal) {
    throw new Error(`No fixture found for step ${missionState.currentStep}`);
  }
  
  return {
    agentId: missionState.agentState.id,
    actionType: proposal.actionType,
    payload: proposal.payload,
    riskClass: proposal.riskClass,
  };
}