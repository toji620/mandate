/**
 * Credit-free test harness for the learning loop.
 *
 * Scores one captured mission, or compares two (base vs tuned), and records the
 * comparison in the append-only run log. It reads verdicts the evaluator already
 * produced — it spends no watsonx credits and calls no model. This is the piece
 * you run today to see the before/after machinery work; the actual tune slots in
 * later by producing the "tuned" capture.
 *
 * Usage:
 *   tsx scripts/training-report.ts <capture.json>                  # score one run
 *   tsx scripts/training-report.ts <base.json> <tuned.json>        # compare two
 */
import * as fs from 'fs';
import type { Verdict } from '@/src/types';
import { scoreRun, compareRuns, type RunStep, type RunScore } from '@/src/training/run-score';
import { appendRunRecord, fingerprintDataset, type TuningRunRecord } from '@/src/training/run-log';

const RUN_LOG = 'data/training/runs.jsonl';
const DATASET = 'data/training/preferences.jsonl';

interface Dataset {
  path: string | null;
  count: number;
  fingerprint: string | null;
}

/**
 * Reads the exported preference dataset, if one exists.
 *
 * The fingerprint is taken over the pairs themselves, never over the file name —
 * the whole point of the field is to answer "which data did this run see?", and
 * two runs on completely different data can share a path. When there is no
 * dataset at all this returns nulls rather than a stand-in hash: a scoring-only
 * run trained on nothing, and the log should say so.
 */
function loadDataset(): Dataset {
  if (!fs.existsSync(DATASET)) return { path: null, count: 0, fingerprint: null };

  const pairs = fs
    .readFileSync(DATASET, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as unknown);

  return { path: DATASET, count: pairs.length, fingerprint: fingerprintDataset(pairs) };
}

interface Capture {
  model?: string;
  verdicts: Array<{ verdict: string }>;
  proposals?: unknown[];
}

function loadCapture(file: string): { model: string; steps: RunStep[] } {
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Capture;
  const steps: RunStep[] = data.verdicts.map((v) => ({ verdict: v.verdict as Verdict }));
  return { model: data.model ?? 'unknown', steps };
}

function printScore(label: string, model: string, file: string, score: RunScore): void {
  console.log(`${label}  ${model}   (${file})`);
  console.log(
    `  steps ${score.steps} | ALLOW ${score.allow}  REVIEW ${score.review}  ` +
      `APPROVAL ${score.approval}  BLOCK ${score.block} | ` +
      `block rate ${(score.blockRate * 100).toFixed(1)}% | reached ${score.reachedBand}`
  );
}

function main(): void {
  const [baseFile, tunedFile] = process.argv.slice(2);

  if (!baseFile) {
    console.error('Usage: tsx scripts/training-report.ts <capture.json> [<tuned.json>]');
    process.exit(1);
  }

  console.log('\n=== Mandate training report ===\n');

  const base = loadCapture(baseFile);
  const baseScore = scoreRun(base.steps);

  // Single-run mode: just the scorecard.
  if (!tunedFile) {
    printScore('RUN  ', base.model, baseFile, baseScore);
    console.log('\n(Note: bands are not stored in captures, so "reached" is verdict-only here.)\n');
    return;
  }

  // Comparison mode: base vs tuned, plus a logged run record.
  const tuned = loadCapture(tunedFile);
  const tunedScore = scoreRun(tuned.steps);
  const cmp = compareRuns(baseScore, tunedScore);

  printScore('BASE ', base.model, baseFile, baseScore);
  console.log('');
  printScore('TUNED', tuned.model, tunedFile, tunedScore);
  console.log('');
  console.log(
    `DELTA  blocks ${cmp.blockDelta >= 0 ? '+' : ''}${cmp.blockDelta} | ` +
      `block rate ${(cmp.blockRateDelta * 100).toFixed(1)}pts | ` +
      `${cmp.improved ? 'IMPROVED' : 'no improvement'}`
  );

  const dataset = loadDataset();

  const record: TuningRunRecord = {
    runId: `run-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    createdAt: new Date().toISOString(),
    status: 'completed',
    method: 'baseline-comparison', // a real weight-tune will log method: 'dpo'
    baseModelId: base.model,
    tunedModelId: tuned.model,
    datasetPath: dataset.path,
    datasetPairCount: dataset.count,
    datasetFingerprint: dataset.fingerprint,
    hyperparameters: {},
    watsonxJobId: null,
    costCredits: 0,
    durationSeconds: null,
    baseScore,
    tunedScore,
    notes: `Compared ${baseFile} vs ${tunedFile}`,
  };
  appendRunRecord(record, RUN_LOG);

  console.log(`\nLogged run ${record.runId} -> ${RUN_LOG}`);
  console.log(
    dataset.fingerprint
      ? `  dataset ${dataset.path} — ${dataset.count} pairs, fingerprint ${dataset.fingerprint}`
      : `  no dataset (${DATASET} not found) — scoring-only run, nothing was trained`
  );
  console.log('');
}

main();
