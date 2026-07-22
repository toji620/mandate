import type { ProposedAction } from '@/src/types';

/**
 * Canonicalises a proposal's spend amount BEFORE it reaches the evaluator.
 *
 * This is the "interpret, don't discard" layer. A live model does not always
 * write the amount into a field called `amount` — Granite wrote `amountGBP`, and
 * sometimes writes a numeric string like "£22,600". Rather than throw that away
 * and make a human retype it, we read it here, deterministically, and hand the
 * evaluator a clean number.
 *
 * This layer is deliberately SEPARATE from the evaluator and deliberately
 * CONSERVATIVE:
 *
 *  - It is not the authority. The evaluator still judges, and still fails closed
 *    (escalates) if a spend arrives with no usable amount. Safety does not depend
 *    on this layer running — missing it costs an unnecessary human approval, never
 *    an unauthorised spend.
 *  - It only reads a small, curated set of field names that unambiguously mean
 *    "the total amount". It never scans arbitrary numeric fields, because that is
 *    how you would grab a discount, a unit price, or a quantity and authorise the
 *    wrong sum.
 *  - Surfacing an amount can only ADD threshold scrutiny (or correctly match a
 *    genuine prior approval). It can never loosen a control. When two recognised
 *    fields disagree, it refuses to guess and lets the evaluator escalate.
 */

/** Field names that unambiguously denote the total committed amount. */
const AMOUNT_FIELDS = [
  'amount',
  'amountgbp',
  'amount_gbp',
  'totalamount',
  'total_amount',
  'totalgbp',
  'total_gbp',
  'totalcost',
  'total_cost',
  'totalcostgbp',
];

/**
 * Coerces one raw value to a finite number, or undefined.
 *
 * Accepts a number, or a numeric string with commas, whitespace and a leading
 * or trailing currency marker (£/$/€ or an ISO code) stripped. Anything else —
 * prose, NaN, Infinity, booleans — is undefined.
 */
function coerce(raw: unknown): number | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;

  if (typeof raw === 'string') {
    const cleaned = raw
      .replace(/[£$€,]/g, '')
      .replace(/\b(gbp|usd|eur)\b/gi, '')
      .trim();
    if (cleaned === '') return undefined;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  }

  return undefined;
}

/**
 * The single amount a spend proposal is committing, if it can be determined
 * unambiguously.
 *
 * Returns undefined when no recognised field carries a usable number, OR when
 * two recognised fields carry DIFFERENT numbers — a conflicting proposal is not
 * something to silently pick a winner for.
 */
export function resolveAmount(payload: Record<string, unknown>): number | undefined {
  const found = new Set<number>();

  for (const [key, value] of Object.entries(payload)) {
    if (!AMOUNT_FIELDS.includes(key.toLowerCase())) continue;
    const n = coerce(value);
    if (n !== undefined) found.add(n);
  }

  return found.size === 1 ? [...found][0] : undefined;
}

/**
 * Returns the proposal with its canonical `amount` field set to the resolved
 * value, when one can be determined and differs from what is already there.
 * Original fields are preserved so the audit trail shows exactly what the agent
 * proposed. When nothing can be resolved, the proposal is returned unchanged and
 * the evaluator's fail-closed backstop takes over.
 */
export function normalizeProposal(action: ProposedAction): ProposedAction {
  const amount = resolveAmount(action.payload);

  if (amount === undefined || action.payload.amount === amount) {
    return action;
  }

  return {
    ...action,
    payload: { ...action.payload, amount },
  };
}
