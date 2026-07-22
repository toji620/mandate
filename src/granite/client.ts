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

export function getModelId(): string {
  return process.env.WATSONX_MODEL_ID || DEFAULT_MODEL_ID;
}

export function isGraniteConfigured(): boolean {
  return Boolean(process.env.WATSONX_API_KEY && process.env.WATSONX_PROJECT_ID);
}

/** Single-turn chat with Granite. Returns the raw text. */
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
}
