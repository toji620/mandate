import { createHash } from 'crypto';

/**
 * Identifies an agent CONFIGURATION: role + model + prompt.
 *
 * Reputation binds to this, not to a mission and not to an "instance". A
 * stateless LLM has no instances — two copies of the same prompt on the same
 * model are the same function and share one track record.
 *
 * Change the prompt or the model and this changes, which resets reputation to
 * zero. That is correct: you tested v1, you trust v1. v2 is a different program
 * and your evidence does not carry over. This is exactly the trust-reset the
 * fine-tune loop needs — a tuned model has a new id, so it re-earns trust.
 */
export function agentVersion(role: string, modelId: string, prompt: string): string {
  return createHash('sha256')
    .update(`${role} ${modelId} ${prompt}`)
    .digest('hex')
    .slice(0, 12);
}
