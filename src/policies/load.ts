import * as fs from 'fs';
import * as path from 'path';
import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { policies as policiesTable, policyRules as policyRulesTable } from '@/db/schema';
import type { PolicyRule, RuleType } from '@/src/types';

/**
 * Loads the policy library.
 *
 * Postgres is the real source. If it is not running, we fall back to the seed
 * documents committed in `data/seed/` — the same JSON that `npm run db:seed`
 * loads into the database, so the rules are identical either way.
 *
 * The fallback exists so that a forgotten `docker compose up` cannot leave the
 * Policy Library blank. `source` is surfaced to the UI so it always says which
 * one it is reading, rather than quietly pretending.
 */

export type PolicySource = 'database' | 'seed-files';

export interface PolicyWithRules {
  id: number;
  title: string;
  sourceDocument: string;
  sectionRef: string | null;
  rules: PolicyRule[];
}

export interface PolicyLibrary {
  policies: PolicyWithRules[];
  source: PolicySource;
}

const SEED_FILES = [
  'finance-approval-matrix.json',
  'procurement-policy.json',
  'approved-vendor-list.json',
  'security-requirements.json',
];

interface SeedRule {
  ruleType: RuleType;
  thresholdValue?: number;
  currency?: string;
  appliesTo?: string;
  sourcePassage: string;
}

interface SeedPolicy {
  title: string;
  sourceDocument: string;
  sectionRef?: string;
  rules: SeedRule[];
}

export async function loadPolicyLibrary(): Promise<PolicyLibrary> {
  const fromDb = await loadFromDatabase();
  if (fromDb) return { policies: fromDb, source: 'database' };

  return { policies: loadFromSeedFiles(), source: 'seed-files' };
}

/** Flattened rules, which is what the evaluator takes. */
export async function loadPolicyRules(): Promise<PolicyRule[]> {
  const library = await loadPolicyLibrary();
  return library.policies.flatMap((p) => p.rules);
}

async function loadFromDatabase(): Promise<PolicyWithRules[] | null> {
  try {
    const rows = await db
      .select()
      .from(policiesTable)
      .orderBy(asc(policiesTable.id));

    if (rows.length === 0) return null; // migrated but never seeded

    const rules = await db
      .select()
      .from(policyRulesTable)
      .orderBy(asc(policyRulesTable.id));

    return rows.map((policy) => ({
      id: policy.id,
      title: policy.title,
      sourceDocument: policy.sourceDocument,
      sectionRef: policy.sectionRef,
      rules: rules
        .filter((r) => r.policyId === policy.id)
        .map((r) => ({
          id: r.id,
          policyId: r.policyId,
          ruleType: r.ruleType as RuleType,
          thresholdValue: r.thresholdValue ?? undefined,
          currency: r.currency ?? undefined,
          appliesTo: r.appliesTo ?? undefined,
          sourcePassage: r.sourcePassage,
        })),
    }));
  } catch {
    // Postgres is not up. The caller falls back to the seed documents.
    return null;
  }
}

/**
 * Reads the committed seed documents.
 *
 * Ids are assigned by position and are therefore stable across restarts, which
 * matters because a Decision cites a rule by id.
 */
function loadFromSeedFiles(): PolicyWithRules[] {
  const seedDir = path.join(process.cwd(), 'data', 'seed');

  let nextPolicyId = 1;
  let nextRuleId = 1;

  return SEED_FILES.map((file) => {
    const raw = fs.readFileSync(path.join(seedDir, file), 'utf-8');
    const seed = JSON.parse(raw) as SeedPolicy;

    const policyId = nextPolicyId++;

    return {
      id: policyId,
      title: seed.title,
      sourceDocument: seed.sourceDocument,
      sectionRef: seed.sectionRef ?? null,
      rules: (seed.rules ?? []).map((rule) => ({
        id: nextRuleId++,
        policyId,
        ruleType: rule.ruleType,
        thresholdValue: rule.thresholdValue,
        currency: rule.currency,
        appliesTo: rule.appliesTo,
        sourcePassage: rule.sourcePassage,
      })),
    };
  });
}
