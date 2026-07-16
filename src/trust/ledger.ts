import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { trustLedger } from '@/db/schema';
import type { LedgerEvent } from '@/src/engine/evaluate';
import type { AutonomyBand, Verdict } from '@/src/types';

/**
 * The trust ledger is the agent's test record. It is the ONLY source of an
 * agent's band — the band is always re-derived from it, never carried by hand.
 *
 * Append-only. There is no update or delete path here, and there must never be.
 *
 * Degrades to an empty history when Postgres is down, which means the agent
 * starts at PROBATION. That is the safe direction to fail.
 */
export async function loadLedger(agentRole: string, version: string): Promise<LedgerEvent[]> {
  try {
    const rows = await db
      .select()
      .from(trustLedger)
      .where(and(eq(trustLedger.agentRole, agentRole), eq(trustLedger.agentVersion, version)))
      .orderBy(asc(trustLedger.timestamp), asc(trustLedger.id));

    // Only CLEAN_ACTION and DEMOTION drive computeBand: clean actions raise
    // reputation, a demotion drops the band and resets it. PROMOTION is derived
    // from reputation thresholds, so replaying a stored promotion would be a
    // second, conflicting source of truth for the band — it is recorded for the
    // audit trail but deliberately NOT fed back in here.
    return rows
      .filter((r) => r.event === 'clean_action' || r.event === 'demotion')
      .map((r) => ({
        eventType: r.event.toUpperCase() as LedgerEvent['eventType'],
        verdict: (r.verdict ?? undefined) as Verdict | undefined,
        bandBefore: r.fromBand as AutonomyBand,
        bandAfter: r.toBand as AutonomyBand,
        isSpendAction: r.isSpendAction,
        createdAt: r.timestamp,
      }));
  } catch {
    console.warn('[trust] Postgres unavailable — agent starts at PROBATION with no history');
    return [];
  }
}

export async function appendLedgerEvent(
  agentRole: string,
  version: string,
  event: LedgerEvent,
  missionId: string,
  stepNumber: number,
  reason: string
): Promise<void> {
  try {
    await db.insert(trustLedger).values({
      agentRole,
      agentVersion: version,
      event: event.eventType.toLowerCase(),
      verdict: event.verdict ?? null,
      isSpendAction: event.isSpendAction ?? false,
      fromBand: event.bandBefore,
      toBand: event.bandAfter,
      reason,
      missionId,
      stepNumber,
    });
  } catch (error) {
    console.error('[trust] failed to append ledger event:', error);
  }
}
