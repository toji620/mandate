import { describe, it, expect } from 'vitest';
import { generationDue } from './tune-trigger';

describe('generationDue', () => {
  it('is not due one decision short of the window', () => {
    const status = generationDue(499, 0, 500);
    expect(status.due).toBe(false);
    expect(status.accumulated).toBe(499);
    expect(status.remaining).toBe(1);
  });

  it('is due exactly at the window boundary', () => {
    const status = generationDue(500, 0, 500);
    expect(status.due).toBe(true);
    expect(status.remaining).toBe(0);
  });

  it('counts from the last recorded run, not from zero', () => {
    const status = generationDue(520, 500, 500);
    expect(status.due).toBe(false);
    expect(status.accumulated).toBe(20);
    expect(status.remaining).toBe(480);
  });

  it('clamps rather than trusts a current total below the last run count', () => {
    const status = generationDue(10, 500, 500);
    expect(status.due).toBe(false);
    expect(status.accumulated).toBe(0);
  });

  it('treats a negative last-run count as zero', () => {
    const status = generationDue(500, -10, 500);
    expect(status.due).toBe(true);
  });

  it('rejects a non-positive window', () => {
    expect(() => generationDue(10, 0, 0)).toThrow();
    expect(() => generationDue(10, 0, -5)).toThrow();
  });

  it('rejects a fractional window', () => {
    expect(() => generationDue(10, 0, 2.5)).toThrow();
  });
});
