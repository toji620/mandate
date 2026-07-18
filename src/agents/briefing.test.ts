import { describe, it, expect } from 'vitest';
import { renderBriefing, renderBlockedProposals } from './briefing';
import type { PolicyRule } from '@/src/types';

const rules: PolicyRule[] = [
  {
    id: 1,
    policyId: 1,
    ruleType: 'SPEND_THRESHOLD',
    thresholdValue: 10000,
    currency: 'GBP',
    appliesTo: 'all',
    sourcePassage: 'Finance Approval Matrix s2.1: over GBP 10,000 needs Finance Director approval',
  },
  { id: 2, policyId: 2, ruleType: 'VENDOR_APPROVAL', appliesTo: 'Dell', sourcePassage: 'AVL: Dell approved' },
  { id: 3, policyId: 2, ruleType: 'VENDOR_APPROVAL', appliesTo: 'HP', sourcePassage: 'AVL: HP approved' },
];

describe('policy briefing', () => {
  it('renders nothing in "none" mode — the agent is deliberately uninformed', () => {
    expect(renderBriefing(rules, 'none')).toBe('');
  });

  it('lists the approved vendors in "full" mode', () => {
    const briefing = renderBriefing(rules, 'full');
    expect(briefing).toContain('Dell');
    expect(briefing).toContain('HP');
  });

  it('states the spend threshold in "full" mode', () => {
    expect(renderBriefing(rules, 'full')).toContain('10000');
  });

  it('says the briefing is guidance enforced by a separate evaluator', () => {
    expect(renderBriefing(rules, 'full').toLowerCase()).toContain('evaluator');
  });

  it('stays compact — a briefing is a summary, not the whole rulebook', () => {
    expect(renderBriefing(rules, 'full').length).toBeLessThan(700);
  });
});

describe('blocked-proposal memory', () => {
  it('renders nothing when nothing has been blocked', () => {
    expect(renderBlockedProposals([])).toBe('');
  });

  it('tells the agent exactly what was rejected and why, so it does not repeat it', () => {
    const text = renderBlockedProposals([
      {
        actionType: 'select_supplier',
        payload: { vendor: 'CheapTech', amount: 18000 },
        reason: 'Vendor "CheapTech" is not on the approved vendor list',
      },
    ]);

    expect(text).toContain('CheapTech');
    expect(text).toContain('not on the approved vendor list');
    expect(text.toLowerCase()).toContain('do not repeat');
  });
});
