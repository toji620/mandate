import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RunScore } from './run-score';

/**
 * The run logbook: an append-only ledger of fine-tuning runs.
 *
 * A tune costs finite credits and cannot be re-run casually, so every run is
 * captured as a durable artifact — the exact dataset it saw (by fingerprint),
 * the watsonx job that produced it, what it cost, and how the model scored before
 * and after. The log IS the evidence: on demo day you show the trend across runs
 * from this file, with no live tune to fail on stage.
 *
 * Append-only, deliberately mirroring the trust ledger. A run's history is a
 * sequence of events (planned -> running -> completed); current state is derived
 * with latestByRun. There is no update or delete path.
 */

export type RunStatus = 'planned' | 'running' | 'completed' | 'failed';

export interface TuningRunRecord {
  runId: string;
  /** ISO timestamp. Passed in by the caller — this module never reads the clock. */
  createdAt: string;
  status: RunStatus;
  /** dpo | sft | prompt-tune — how the model was tuned. */
  method: string;
  baseModelId: string;
  /** The tuned model's id, once the job produces one. null until then. */
  tunedModelId: string | null;
  /** Where the training data came from, or `null` for a scoring-only run. */
  datasetPath: string | null;
  datasetPairCount: number;
  /**
   * Hash of the exact training data, so a run is tied to the data it saw.
   *
   * `null` means this record has no dataset behind it — a scoring-only run, where
   * nothing was trained. That is deliberately representable: a fabricated hash
   * would make an unverifiable record look verified, which is the one thing this
   * log exists to prevent.
   */
  datasetFingerprint: string | null;
  hyperparameters: Record<string, unknown>;
  watsonxJobId: string | null;
  costCredits: number | null;
  durationSeconds: number | null;
  /** Score of the base model before tuning, from the evaluation harness. */
  baseScore: RunScore | null;
  /** Score of the tuned model after tuning. */
  tunedScore: RunScore | null;
  /**
   * Total evaluator decisions recorded when this run was cut. The batch
   * trigger (tune-trigger.ts) counts its window from the latest record's
   * value, so each generation knows how much new signal it was cut from.
   */
  decisionsAtRun?: number;
  notes: string;
}

/** A stable content hash of a dataset, so a run can be tied to the exact data it trained on. */
export function fingerprintDataset(pairs: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex').slice(0, 16);
}

/** Appends one run event to the log, creating the file and its directory if needed. */
export function appendRunRecord(record: TuningRunRecord, logPath: string): void {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, JSON.stringify(record) + '\n');
}

/** Reads every run event, oldest first. Empty when the log does not exist yet. */
export function readRunLog(logPath: string): TuningRunRecord[] {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as TuningRunRecord);
}

/**
 * Collapses the event log to the current state of each run: the last event
 * recorded for each runId wins. This is how a planned -> running -> completed
 * sequence reads back as a single completed run.
 */
export function latestByRun(records: TuningRunRecord[]): TuningRunRecord[] {
  const latest = new Map<string, TuningRunRecord>();
  for (const r of records) latest.set(r.runId, r);
  return [...latest.values()];
}
