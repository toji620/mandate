/**
 * The batch trigger that closes the learning loop: "every N evaluator
 * decisions, a tuning generation is due."
 *
 * The rest of the pipeline is already continuous — every decision lands in the
 * audit trail, the exporter can turn the accumulated trail into preference
 * pairs at any moment, and runs.jsonl records each generation against the
 * exact dataset it saw. What was missing is the policy for WHEN a new
 * generation should be cut. This module is that policy, kept pure so the rule
 * itself is pinned by tests: the window is counted in evaluator decisions
 * (the unit the system actually produces), not in wall-clock time.
 *
 * Note what the window does not promise: N decisions are not N training pairs.
 * Only a block with a later same-action correction becomes a pair, so a
 * well-behaved agent starves its own training set — the better it gets, the
 * bigger the window a generation needs. That is a property of using the
 * evaluator as the reward function, and it is reported, not hidden.
 */

export interface WindowStatus {
  /** True when enough decisions have accumulated to cut the next generation. */
  due: boolean;
  /** Decisions recorded since the last generation was cut. */
  accumulated: number;
  windowSize: number;
  /** Decisions still needed before the next generation is due (0 when due). */
  remaining: number;
}

/**
 * Decides whether the next tuning generation is due.
 *
 * `decisionsAtLastRun` is the total decision count recorded on the most recent
 * run-log entry (0 when the log is empty). Counts only move forward: the
 * audit trail is append-only, so a lower current total than the last run's
 * is clamped rather than trusted.
 */
export function generationDue(
  totalDecisions: number,
  decisionsAtLastRun: number,
  windowSize: number
): WindowStatus {
  if (!Number.isInteger(windowSize) || windowSize <= 0) {
    throw new Error(`windowSize must be a positive integer, got ${windowSize}`);
  }

  const accumulated = Math.max(0, totalDecisions - Math.max(0, decisionsAtLastRun));

  return {
    due: accumulated >= windowSize,
    accumulated,
    windowSize,
    remaining: Math.max(0, windowSize - accumulated),
  };
}
