import { describe, it, expect } from 'vitest';
import { scoreRun, compareRuns, type RunStep } from './run-score';

/**
 * The before/after evaluation harness. A fine-tune's whole claim is "the model
 * proposes fewer things that get blocked" — so we score a run by its verdict mix
 * and how far up the trust ladder it climbed, and compare two runs to get the
 * delta that is the demo's evidence.
 *
 * Scoring is pure: it reads verdicts and bands that the evaluator already
 * produced. It never re-judges anything.
 */

function step(verdict: RunStep['verdict'], bandAfter?: RunStep['bandAfter']): RunStep {
  return { verdict, bandAfter };
}

describe('scoreRun', () => {
  it('counts each verdict and the block rate', () => {
    const score = scoreRun([
      step('ALLOW'),
      step('ALLOW'),
      step('REVIEW'),
      step('APPROVAL'),
      step('BLOCK'),
    ]);

    expect(score.steps).toBe(5);
    expect(score.allow).toBe(2);
    expect(score.review).toBe(1);
    expect(score.approval).toBe(1);
    expect(score.block).toBe(1);
    expect(score.blockRate).toBeCloseTo(0.2);
  });

  it('reports the highest band the agent reached', () => {
    const score = scoreRun([
      step('ALLOW', 'PROBATION'),
      step('ALLOW', 'SUPERVISED'),
      step('BLOCK', 'PROBATION'), // demoted back — but it DID reach SUPERVISED
    ]);

    expect(score.reachedBand).toBe('SUPERVISED');
  });

  it('reaches TRUSTED when a step records it', () => {
    const score = scoreRun([step('ALLOW', 'SUPERVISED'), step('ALLOW', 'TRUSTED')]);
    expect(score.reachedBand).toBe('TRUSTED');
  });

  it('defaults to PROBATION when no band information is present', () => {
    const score = scoreRun([step('ALLOW'), step('ALLOW')]);
    expect(score.reachedBand).toBe('PROBATION');
  });

  it('handles an empty run without dividing by zero', () => {
    const score = scoreRun([]);
    expect(score.steps).toBe(0);
    expect(score.blockRate).toBe(0);
  });
});

describe('compareRuns', () => {
  it('reports fewer blocks as an improvement', () => {
    const base = scoreRun([step('BLOCK'), step('BLOCK'), step('ALLOW')]);
    const tuned = scoreRun([step('ALLOW'), step('ALLOW'), step('ALLOW')]);

    const cmp = compareRuns(base, tuned);

    expect(cmp.blockDelta).toBe(-2); // two fewer blocks
    expect(cmp.improved).toBe(true);
  });

  it('does not call an unchanged block rate an improvement', () => {
    const base = scoreRun([step('BLOCK'), step('ALLOW')]);
    const tuned = scoreRun([step('BLOCK'), step('ALLOW')]);

    const cmp = compareRuns(base, tuned);

    expect(cmp.blockRateDelta).toBe(0);
    expect(cmp.improved).toBe(false);
  });

  it('counts reaching a higher band as an improvement even if block rates tie', () => {
    const base = scoreRun([step('ALLOW', 'SUPERVISED')]);
    const tuned = scoreRun([step('ALLOW', 'TRUSTED')]);

    const cmp = compareRuns(base, tuned);
    expect(cmp.improved).toBe(true);
  });
});
