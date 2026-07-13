import type { ProposedAction, AgentState } from '@/src/types';

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
  mode: ProposalMode = 'replay'
): Promise<ProposedAction> {
  if (mode === 'replay') {
    return proposeReplay(missionState);
  }
  
  // Live mode stub - to be implemented in Stage 2-3 with Granite
  return proposeLive(missionState);
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

/**
 * Live mode: calls Granite via watsonx.ai SDK (stub for Stage 2-3)
 */
async function proposeLive(_missionState: MissionState): Promise<ProposedAction> {
  // TODO: Implement in Stage 2-3 with watsonx.ai SDK
  throw new Error('Live mode not yet implemented - use replay mode for now');
}
