import { describe, it, expect } from 'vitest';
import { normalizeProposal, resolveAmount } from './normalize';
import type { ProposedAction } from '@/src/types';

function action(payload: Record<string, unknown>): ProposedAction {
  return { agentId: 1, actionType: 'commit_spend', payload, riskClass: 'high' };
}

describe('resolveAmount — reads a spend amount the agent clearly meant', () => {
  it('reads the canonical amount field unchanged', () => {
    expect(resolveAmount({ amount: 22400 })).toBe(22400);
  });

  it('interprets a known alias (amountGBP) rather than discarding it', () => {
    // This is the exact field Granite produced.
    expect(resolveAmount({ amountGBP: 22600 })).toBe(22600);
  });

  it('interprets other known total-amount spellings', () => {
    expect(resolveAmount({ totalAmount: 15000 })).toBe(15000);
    expect(resolveAmount({ totalGBP: 15000 })).toBe(15000);
    expect(resolveAmount({ total_cost: 15000 })).toBe(15000);
  });

  it('coerces a numeric string, stripping commas and currency', () => {
    expect(resolveAmount({ amount: '22600' })).toBe(22600);
    expect(resolveAmount({ amount: '£22,600' })).toBe(22600);
    expect(resolveAmount({ amountGBP: '22,600 GBP' })).toBe(22600);
  });

  it('does NOT invent an amount from unrelated numeric fields', () => {
    // quantity and unitPrice are numbers but are not the total commitment.
    // Guessing here is how you authorise the wrong sum.
    expect(resolveAmount({ quantity: 20, unitPrice: 1130 })).toBeUndefined();
  });

  it('refuses to guess when two recognised fields disagree', () => {
    // A proposal that says two different amounts is not something to
    // silently pick a winner for — the evaluator will escalate it.
    expect(resolveAmount({ amount: 22600, totalCost: 30000 })).toBeUndefined();
  });

  it('treats agreeing duplicate fields as unambiguous', () => {
    expect(resolveAmount({ amount: 22600, amountGBP: 22600 })).toBe(22600);
  });

  it('returns undefined for junk that is not a number', () => {
    expect(resolveAmount({ amount: 'twenty two thousand' })).toBeUndefined();
    expect(resolveAmount({ amount: NaN })).toBeUndefined();
    expect(resolveAmount({})).toBeUndefined();
  });
});

describe('normalizeProposal — canonicalises a proposal before it is judged', () => {
  it('writes the interpreted value into the canonical amount field', () => {
    const result = normalizeProposal(action({ vendor: 'Dell', amountGBP: 22600 }));
    expect(result.payload.amount).toBe(22600);
  });

  it('preserves the original fields alongside the canonical one', () => {
    const result = normalizeProposal(action({ vendor: 'Dell', amountGBP: 22600 }));
    // The original field is kept for the audit trail; we add, not replace.
    expect(result.payload.amountGBP).toBe(22600);
    expect(result.payload.vendor).toBe('Dell');
  });

  it('leaves a clean proposal untouched', () => {
    const original = action({ vendor: 'Dell', amount: 22400 });
    const result = normalizeProposal(original);
    expect(result.payload.amount).toBe(22400);
  });

  it('does not fabricate an amount when none can be resolved', () => {
    const result = normalizeProposal(action({ vendor: 'Dell', quantity: 20 }));
    expect(result.payload.amount).toBeUndefined();
  });
});
