/**
 * The only place a watsonx client is constructed.
 *
 * Previously agents.ts and explain.ts each built their own, and each hardcoded
 * `ibm/granite-13b-chat-v2` — a model IBM has withdrawn. Centralising it means
 * the model id lives in exactly one place and swaps by env var when IBM retires
 * the next one. When you fine-tune, point WATSONX_MODEL_ID at your tuned model;
 * nothing else changes.
 */

// granite-4-h-small follows instructions markedly better than granite-3-8b-instruct:
// on the same procurement mission it kept to approved vendors where the 3-8b model
// broke policy twice. Overridable with WATSONX_MODEL_ID (e.g. a fine-tuned model).
const DEFAULT_MODEL_ID = 'ibm/granite-4-h-small';
const DEFAULT_URL = 'https://us-south.ml.cloud.ibm.com';

export class GraniteNotConfiguredError extends Error {
  constructor() {
    super(
      'Granite is not configured. Set WATSONX_API_KEY and WATSONX_PROJECT_ID in .env ' +
        'to run in live mode. Replay mode needs neither.'
    );
    this.name = 'GraniteNotConfiguredError';
  }
}

export class GraniteBusyError extends Error {
  constructor(attempts: number) {
    super(
      `watsonx is rate-limiting this model (free-tier concurrency pool is full). ` +
        `Gave up after ${attempts} attempts with backoff. Try again in a minute — ` +
        `the pool is shared across all free-plan users of the model.`
    );
    this.name = 'GraniteBusyError';
  }
}

export function getModelId(): string {
  return process.env.WATSONX_MODEL_ID || DEFAULT_MODEL_ID;
}

export function isGraniteConfigured(): boolean {
  return Boolean(process.env.WATSONX_API_KEY && process.env.WATSONX_PROJECT_ID);
}

/**
 * Backoff for 429s. The Lite plan enforces two very different limits that both
 * surface as 429: a per-instance 2 requests/second rate, and a global pool of
 * 10 concurrent free requests per model shared across ALL Lite users. The
 * first clears in under a second; the second clears whenever strangers'
 * requests finish. Exponential delays with jitter cover both without
 * hammering a saturated pool.
 */
const RETRY_DELAYS_MS = [1000, 2500, 5000, 10000, 20000];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimit(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: number }).status === 429
  );
}

/** Single-turn chat with Granite. Returns the raw text. Retries 429s with backoff. */
export async function graniteChat(
  prompt: string,
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  if (!isGraniteConfigured()) throw new GraniteNotConfiguredError();

  const { WatsonXAI } = await import('@ibm-cloud/watsonx-ai');
  const { IamAuthenticator } = await import('ibm-cloud-sdk-core');

  const client = WatsonXAI.newInstance({
    version: '2024-05-31',
    serviceUrl: process.env.WATSONX_URL || DEFAULT_URL,
    authenticator: new IamAuthenticator({ apikey: process.env.WATSONX_API_KEY! }),
  });

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await client.textChat({
        modelId: getModelId(),
        projectId: process.env.WATSONX_PROJECT_ID!,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: opts.maxTokens ?? 500,
        temperature: opts.temperature ?? 0.7,
      });

      const text = response.result.choices[0]?.message?.content?.trim();
      if (!text) throw new Error('Granite returned an empty response');

      return text;
    } catch (error) {
      if (!isRateLimit(error)) throw error;
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw new GraniteBusyError(attempt + 1);
      }
      const jitter = Math.floor(Math.random() * 500);
      const delay = RETRY_DELAYS_MS[attempt] + jitter;
      console.warn(
        `[granite] 429 (attempt ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}), backing off ${delay}ms`
      );
      await sleep(delay);
    }
  }
}
