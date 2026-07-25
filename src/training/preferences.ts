import type { Verdict } from '@/src/types';

/**
 * Turns the audit trail into a preference dataset — the credit-free half of the
 * learning loop.
 *
 * The evaluator is a deterministic reward function: it labels every proposal
 * ALLOW / REVIEW / APPROVAL / BLOCK, for free, with no human in the loop. That
 * labelling is the expensive half of RLHF, and Mandate emits it as a byproduct
 * of governance. This module reads those labels and builds DPO-style pairs: a
 * BLOCKed proposal is the `rejected` completion, and a later permitted proposal
 * of the SAME action type in the SAME mission is the `chosen` one — the agent's
 * own correction after being told why it was wrong.
 *
 * Pure and I/O-free, so it is testable without a database and the exact pairing
 * rule can be pinned down in tests rather than discovered in a script.
 */

/** The fields of a recorded decision this builder needs. A structural subset of the DB row. */
export interface LabelledDecision {
  missionId: string;
  missionGoal: string;
  stepNumber: number;
  actionType: string;
  verdict: Verdict;
  actionPayload: unknown;
  explanation: string | null;
  sourcePassage: string | null;
  riskClass: string;
}

export interface PreferencePair {
  prompt: string;
  chosen: unknown;
  rejected: unknown;
  rejected_because: string;
  cited_rule: string | null;
}

export interface PreferenceResult {
  pairs: PreferencePair[];
  /** Blocks with no clean same-action counterpart, so no honest pair could be built. */
  skipped: number;
}

/**
 * Builds preference pairs from labelled decisions.
 *
 * A pair is only emitted when a block has a later permitted proposal of the same
 * action type in the same mission — the genuine "here is what you should have
 * done instead". Blocks without such a counterpart are skipped and counted, so a
 * caller can report exactly how much of the signal was usable rather than pad the
 * dataset with mismatched examples.
 */
export function buildPreferencePairs(decisions: LabelledDecision[]): PreferenceResult {
  const byMission = new Map<string, LabelledDecision[]>();
  for (const d of decisions) {
    if (!byMission.has(d.missionId)) byMission.set(d.missionId, []);
    byMission.get(d.missionId)!.push(d);
  }

  const pairs: PreferencePair[] = [];
  let skipped = 0;

  for (const steps of byMission.values()) {
    const ordered = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);

    for (const blocked of ordered.filter((s) => s.verdict === 'BLOCK')) {
      const correction = ordered.find(
        (s) =>
          s.stepNumber > blocked.stepNumber &&
          s.actionType === blocked.actionType &&
          s.verdict !== 'BLOCK'
      );

      if (!correction) {
        skipped++;
        continue;
      }

      pairs.push({
        prompt:
          `Mission: ${blocked.missionGoal}\n` +
          `Step ${blocked.stepNumber}: propose a ${blocked.actionType} action.`,
        chosen: correction.actionPayload,
        rejected: blocked.actionPayload,
        rejected_because: blocked.explanation ?? '',
        cited_rule: blocked.sourcePassage,
      });
    }
  }

  return { pairs, skipped };
}
