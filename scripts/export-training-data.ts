// Must be first: the db pool is built at import time and needs DATABASE_URL
// loaded before any module that imports `db` is resolved.
import 'dotenv/config';

import * as fs from 'fs';
import { getAllDecisions } from '@/src/orchestrator/persistence';

/**
 * Turns the audit trail into a preference dataset.
 *
 * The evaluator is a deterministic reward function: it labels every proposal
 * ALLOW or BLOCK, for free, instantly, with no human in the loop. That labelling
 * is the expensive half of RLHF, and Mandate emits it as a byproduct of
 * governance.
 *
 * Emits DPO-style pairs: within a mission, a BLOCKed proposal is the `rejected`
 * completion and a later permitted proposal for the same action type is the
 * `chosen` one. This is the corpus a fine-tune (InstructLab / DPO on Granite)
 * would consume. Fine-tuning itself is future work; this proves the corpus
 * exists and is generated automatically.
 */
interface PreferencePair {
  prompt: string;
  chosen: Record<string, unknown>;
  rejected: Record<string, unknown>;
  rejected_because: string;
  cited_rule: string | null;
}

async function main() {
  const decisions = await getAllDecisions();

  if (decisions === null) {
    console.error('Postgres is not running. Start it: npm run db:up');
    process.exit(1);
  }

  const byMission = new Map<string, typeof decisions>();
  for (const d of decisions) {
    if (!byMission.has(d.missionId)) byMission.set(d.missionId, []);
    byMission.get(d.missionId)!.push(d);
  }

  const pairs: PreferencePair[] = [];

  for (const [, steps] of byMission) {
    const ordered = [...steps].sort((a, b) => a.stepNumber - b.stepNumber);

    for (const blocked of ordered.filter((s) => s.verdict === 'BLOCK')) {
      // The chosen completion: a later, permitted proposal of the same action type.
      const chosen = ordered.find(
        (s) =>
          s.stepNumber > blocked.stepNumber &&
          s.actionType === blocked.actionType &&
          s.verdict !== 'BLOCK'
      );

      // Fall back to any permitted commercial action in the same mission.
      const fallback = ordered.find((s) => s.verdict !== 'BLOCK' && s.riskClass !== 'low');
      const good = chosen ?? fallback;
      if (!good) continue;

      pairs.push({
        prompt:
          `Mission: ${blocked.missionGoal}\n` +
          `Step ${blocked.stepNumber}: propose a ${blocked.actionType} action.`,
        chosen: good.actionPayload as Record<string, unknown>,
        rejected: blocked.actionPayload as Record<string, unknown>,
        rejected_because: blocked.explanation ?? '',
        cited_rule: blocked.sourcePassage,
      });
    }
  }

  const out = 'data/training/preferences.jsonl';
  fs.mkdirSync('data/training', { recursive: true });
  fs.writeFileSync(out, pairs.map((p) => JSON.stringify(p)).join('\n') + (pairs.length ? '\n' : ''));

  console.log(`\n${decisions.length} decisions across ${byMission.size} missions`);
  console.log(`${pairs.length} preference pairs -> ${out}`);
  console.log('\nThe evaluator labelled every one of these. No human annotation.');
  console.log('Next: DPO / InstructLab fine-tune of Granite on this corpus.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
