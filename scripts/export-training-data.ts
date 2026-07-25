// Must be first: the db pool is built at import time and needs DATABASE_URL
// loaded before any module that imports `db` is resolved.
import 'dotenv/config';

import * as fs from 'fs';
import { getAllDecisions } from '@/src/orchestrator/persistence';
import { buildPreferencePairs, type LabelledDecision } from '@/src/training/preferences';

/**
 * Exports the audit trail as a preference dataset for a fine-tune.
 *
 * The pairing logic lives in src/training/preferences.ts (pure and tested); this
 * script is just the I/O around it: read the decisions from Postgres, build the
 * pairs, write the JSONL. Fine-tuning itself is future work — this proves the
 * corpus exists and is generated automatically, with no human annotation.
 */
async function main() {
  const decisions = await getAllDecisions();

  if (decisions === null) {
    console.error('Postgres is not running. Start it: npm run db:up');
    process.exit(1);
  }

  const { pairs, skipped } = buildPreferencePairs(decisions as unknown as LabelledDecision[]);
  const missionCount = new Set(decisions.map((d) => d.missionId)).size;

  const out = 'data/training/preferences.jsonl';
  fs.mkdirSync('data/training', { recursive: true });
  fs.writeFileSync(out, pairs.map((p) => JSON.stringify(p)).join('\n') + (pairs.length ? '\n' : ''));

  console.log(`\n${decisions.length} decisions across ${missionCount} missions`);
  console.log(`${pairs.length} preference pairs -> ${out}`);
  if (skipped > 0) {
    console.log(`${skipped} block(s) had no clean same-action correction and were skipped.`);
  }
  console.log('\nThe evaluator labelled every one of these. No human annotation.');
  console.log('Next: DPO / InstructLab fine-tune of Granite on this corpus.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
