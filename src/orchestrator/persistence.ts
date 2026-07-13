import { eq, desc } from 'drizzle-orm';
import { db } from '@/db';
import { decisions, actions, trustLedger } from '@/db/schema';
import type { MissionStep, PendingApproval } from './types';

/**
 * Persistence layer for mission decisions, approvals, and trust ledger.
 * Gracefully degrades when database is unavailable (e.g., in tests).
 */

let dbAvailable = true;

/**
 * Check if database is available. Used for graceful degradation.
 */
async function checkDbAvailable(): Promise<boolean> {
  if (!dbAvailable) return false;
  
  try {
    // Simple query to check connection
    await db.select().from(decisions).limit(1);
    return true;
  } catch (error) {
    console.warn('Database not available, persistence disabled:', error);
    dbAvailable = false;
    return false;
  }
}

/**
 * Save a decision to the database.
 */
export async function saveDecision(
  missionId: string,
  step: MissionStep
): Promise<void> {
  if (!(await checkDbAvailable())) {
    console.log('[Persistence] DB unavailable, skipping decision save');
    return;
  }

  try {
    await db.insert(decisions).values({
      missionId,
      stepNumber: step.stepNumber,
      agentRole: step.agentRole,
      actionType: step.proposal.actionType,
      actionPayload: step.proposal.payload,
      verdict: step.decision.verdict,
      explanation: step.decision.explanation,
      sourcePassage: step.decision.sourcePassage || null,
      riskClass: step.proposal.riskClass,
      agentBandBefore: step.agentStateBefore.autonomyBand,
      agentBandAfter: step.agentStateAfter.autonomyBand,
      timestamp: new Date(step.timestamp),
    });
    
    console.log(`[Persistence] Saved decision: mission=${missionId}, step=${step.stepNumber}, verdict=${step.decision.verdict}`);
  } catch (error) {
    console.error('[Persistence] Failed to save decision:', error);
  }
}

/**
 * Save a pending approval to the database.
 */
export async function saveApproval(
  approval: PendingApproval
): Promise<void> {
  if (!(await checkDbAvailable())) {
    console.log('[Persistence] DB unavailable, skipping approval save');
    return;
  }

  try {
    await db.insert(actions).values({
      id: approval.id,
      missionId: approval.missionId,
      stepNumber: approval.stepNumber,
      agentRole: approval.agentName,
      actionType: approval.proposal.actionType,
      actionPayload: approval.proposal.payload,
      status: approval.status,
      requestedAt: new Date(approval.createdAt),
      approvedBy: null,
      approvedAt: null,
    });
    
    console.log(`[Persistence] Saved approval: id=${approval.id}, mission=${approval.missionId}`);
  } catch (error) {
    console.error('[Persistence] Failed to save approval:', error);
  }
}

/**
 * Update an approval status in the database.
 */
export async function updateApprovalStatus(
  approvalId: string,
  status: 'approved' | 'rejected',
  approvedBy: string
): Promise<void> {
  if (!(await checkDbAvailable())) {
    console.log('[Persistence] DB unavailable, skipping approval update');
    return;
  }

  try {
    await db
      .update(actions)
      .set({
        status,
        approvedBy,
        approvedAt: new Date(),
      })
      .where(eq(actions.id, approvalId));
    
    console.log(`[Persistence] Updated approval: id=${approvalId}, status=${status}`);
  } catch (error) {
    console.error('[Persistence] Failed to update approval:', error);
  }
}

/**
 * Save a trust ledger entry (promotion/demotion event).
 */
export async function saveTrustLedgerEntry(
  agentRole: string,
  event: 'promotion' | 'demotion',
  fromBand: string,
  toBand: string,
  reason: string,
  missionId?: string,
  stepNumber?: number
): Promise<void> {
  if (!(await checkDbAvailable())) {
    console.log('[Persistence] DB unavailable, skipping ledger entry');
    return;
  }

  try {
    await db.insert(trustLedger).values({
      agentRole,
      event,
      fromBand,
      toBand,
      reason,
      missionId: missionId || null,
      stepNumber: stepNumber || null,
      timestamp: new Date(),
    });
    
    console.log(`[Persistence] Saved ledger entry: agent=${agentRole}, event=${event}, ${fromBand}→${toBand}`);
  } catch (error) {
    console.error('[Persistence] Failed to save ledger entry:', error);
  }
}

/**
 * Get all decisions for a mission.
 */
export async function getDecisionsByMission(
  missionId: string
): Promise<Array<typeof decisions.$inferSelect>> {
  if (!(await checkDbAvailable())) {
    return [];
  }

  try {
    const results = await db
      .select()
      .from(decisions)
      .where(eq(decisions.missionId, missionId))
      .orderBy(decisions.stepNumber);
    
    return results;
  } catch (error) {
    console.error('[Persistence] Failed to get decisions:', error);
    return [];
  }
}

/**
 * Get all pending approvals.
 */
export async function getPendingApprovals(): Promise<Array<typeof actions.$inferSelect>> {
  if (!(await checkDbAvailable())) {
    return [];
  }

  try {
    const results = await db
      .select()
      .from(actions)
      .where(eq(actions.status, 'pending'))
      .orderBy(desc(actions.requestedAt));
    
    return results;
  } catch (error) {
    console.error('[Persistence] Failed to get pending approvals:', error);
    return [];
  }
}

/**
 * Get trust ledger history for an agent.
 */
export async function getTrustLedgerHistory(
  agentRole: string
): Promise<Array<typeof trustLedger.$inferSelect>> {
  if (!(await checkDbAvailable())) {
    return [];
  }

  try {
    const results = await db
      .select()
      .from(trustLedger)
      .where(eq(trustLedger.agentRole, agentRole))
      .orderBy(trustLedger.timestamp);
    
    return results;
  } catch (error) {
    console.error('[Persistence] Failed to get ledger history:', error);
    return [];
  }
}
