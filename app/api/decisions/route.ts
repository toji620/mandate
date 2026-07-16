import { NextResponse } from 'next/server';
import { getAllDecisions } from '@/src/orchestrator/persistence';
import { orchestrator } from '@/src/orchestrator/orchestrator';

/**
 * GET /api/decisions - every decision ever made, for the Flight Recorder.
 *
 * Postgres is the record of truth. When it is not running we fall back to the
 * missions still held in memory, so a demo run is always replayable even if
 * `docker compose up` was forgotten. `source` says which it is.
 */
export interface DecisionRecord {
  missionId: string;
  missionGoal: string;
  stepNumber: number;
  agentRole: string;
  actionType: string;
  actionPayload: Record<string, unknown>;
  verdict: string;
  ruleId: number | null;
  explanation: string;
  graniteExplanation: string | null;
  explanationSource: string | null;
  sourcePassage: string | null;
  riskClass: string;
  agentBandBefore: string;
  agentBandAfter: string;
  reputationBefore: number;
  reputationAfter: number;
  timestamp: string;
}

export async function GET() {
  const persisted = await getAllDecisions();

  if (persisted !== null && persisted.length > 0) {
    const decisions: DecisionRecord[] = persisted.map((d) => ({
      missionId: d.missionId,
      missionGoal: d.missionGoal,
      stepNumber: d.stepNumber,
      agentRole: d.agentRole,
      actionType: d.actionType,
      actionPayload: d.actionPayload as Record<string, unknown>,
      verdict: d.verdict,
      ruleId: d.ruleId,
      explanation: d.explanation ?? '',
      graniteExplanation: d.graniteExplanation,
      explanationSource: d.explanationSource,
      sourcePassage: d.sourcePassage,
      riskClass: d.riskClass,
      agentBandBefore: d.agentBandBefore,
      agentBandAfter: d.agentBandAfter,
      reputationBefore: d.reputationBefore,
      reputationAfter: d.reputationAfter,
      timestamp: d.timestamp.toISOString(),
    }));

    return NextResponse.json({ decisions, source: 'database' });
  }

  // Postgres down, or up but empty: replay what is in memory.
  const decisions: DecisionRecord[] = orchestrator
    .getAllMissions()
    .flatMap((mission) =>
      mission.steps.map((step) => ({
        missionId: mission.id,
        missionGoal: mission.goal,
        stepNumber: step.stepNumber,
        agentRole: step.agentRole,
        actionType: step.proposal.actionType,
        actionPayload: step.proposal.payload,
        verdict: step.decision.verdict,
        ruleId: step.decision.ruleId ?? null,
        explanation: step.decision.explanation,
        graniteExplanation: step.graniteExplanation ?? null,
        explanationSource: step.explanationSource ?? null,
        sourcePassage: step.decision.sourcePassage ?? null,
        riskClass: step.proposal.riskClass,
        agentBandBefore: step.agentStateBefore.autonomyBand,
        agentBandAfter: step.agentStateAfter.autonomyBand,
        reputationBefore: step.agentStateBefore.reputation,
        reputationAfter: step.agentStateAfter.reputation,
        timestamp: new Date(step.timestamp).toISOString(),
      }))
    )
    .reverse();

  return NextResponse.json({
    decisions,
    source: persisted === null ? 'in-memory' : 'database',
  });
}
