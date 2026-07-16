import { describe, it, expect } from 'vitest';
import { agentVersion } from './version';

describe('agent config version', () => {
  it('is stable for the same role, model and prompt', () => {
    const a = agentVersion('sourcing', 'ibm/granite-3-3-8b-instruct', 'You are a Sourcing Agent.');
    const b = agentVersion('sourcing', 'ibm/granite-3-3-8b-instruct', 'You are a Sourcing Agent.');
    expect(a).toBe(b);
  });

  it('changes when the prompt changes — a new prompt is a new agent', () => {
    const v1 = agentVersion('sourcing', 'ibm/granite-3-3-8b-instruct', 'You are a Sourcing Agent.');
    const v2 = agentVersion('sourcing', 'ibm/granite-3-3-8b-instruct', 'You are a THRIFTY Sourcing Agent.');
    expect(v1).not.toBe(v2);
  });

  it('changes when the model changes — trust in v1 says nothing about v2', () => {
    // This is the fine-tune trust-reset: a tuned model has a new id, so it
    // re-earns trust from scratch rather than inheriting the base model's.
    const a = agentVersion('sourcing', 'ibm/granite-3-3-8b-instruct', 'prompt');
    const b = agentVersion('sourcing', 'mandate-sourcing-v2', 'prompt');
    expect(a).not.toBe(b);
  });

  it('differs between roles', () => {
    expect(agentVersion('sourcing', 'm', 'p')).not.toBe(agentVersion('procurement', 'm', 'p'));
  });
});
