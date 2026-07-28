// Must be first: the db pool is built at import time and needs DATABASE_URL
// loaded before any module that imports `db` is resolved.
import 'dotenv/config';

import * as fs from 'fs';
import { getAllDecisions } from '@/src/orchestrator/persistence';
import { generationDue } from '@/src/training/tune-trigger';
import {
  appendRunRecord,
  fingerprintDataset,
  latestByRun,
  readRunLog,
  type TuningRunRecord,
} from '@/src/training/run-log';
import { getModelId } from '@/src/granite/client';

/**
 * Reports where the learning loop stands: how many evaluator decisions have
 * accumulated since the last tuning generation, and whether the next one is
 * due. With --plan, cuts the next generation as a `planned` record in
 * runs.jsonl, fingerprinted against the exported dataset — the honest state
 * for a tune that is specified but cannot yet execute (the Lite watsonx plan
 * does not run tuning experiments).
 *
 *   npm run tune:status                 # report the window (TUNE_WINDOW, default 500)
 *   npm run tune:status -- --plan "..." # append the next generation as planned
 */
const LOG = 'data/training/runs.jsonl';
const DATASET = 'data/training/preferences.jsonl';

async function main() {
  const windowSize = Number(process.env.TUNE_WINDOW ?? 500);

  const decisions = await getAllDecisions();
  if (decisions === null) {
    console.error('Postgres is not running. Start it: npm run db:up');
    process.exit(1);
  }

  const records = latestByRun(readRunLog(LOG));
  const last = records[records.length - 1];
  const status = generationDue(decisions.length, last?.decisionsAtRun ?? 0, windowSize);

  console.log(`\nLearning-loop window: ${status.accumulated}/${status.windowSize} evaluator decisions accumulated`);
  console.log(
    status.due
      ? 'Generation due: enough signal has accumulated to cut the next dataset.'
      : `Not due yet: ${status.remaining} more decision(s) before the next generation.`
  );
  console.log(`Recorded generations: ${records.length}`);

  const planIdx = process.argv.indexOf('--plan');
  if (planIdx !== -1) {
    if (!status.due) {
      console.error('\nRefusing to plan a generation before the window is due.');
      process.exit(1);
    }
    if (!fs.existsSync(DATASET)) {
      console.error(`\nNo dataset at ${DATASET}. Run: npm run export:training`);
      process.exit(1);
    }

    const pairs = fs
      .readFileSync(DATASET, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

    const record: TuningRunRecord = {
      runId: `gen-${records.length + 1}`,
      createdAt: new Date().toISOString(),
      status: 'planned',
      method: 'dpo',
      baseModelId: getModelId(),
      tunedModelId: null,
      datasetPath: DATASET,
      datasetPairCount: pairs.length,
      datasetFingerprint: fingerprintDataset(pairs),
      hyperparameters: {},
      watsonxJobId: null,
      costCredits: null,
      durationSeconds: null,
      baseScore: null,
      tunedScore: null,
      decisionsAtRun: decisions.length,
      notes: process.argv[planIdx + 1] ?? '',
    };

    appendRunRecord(record, LOG);
    console.log(`\nPlanned ${record.runId}: ${record.datasetPairCount} pair(s), fingerprint ${record.datasetFingerprint}.`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
