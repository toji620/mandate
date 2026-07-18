// Must be first: loads .env before any module that reads it at import time.
import 'dotenv/config';

import { getModelId, isGraniteConfigured } from '@/src/granite/client';

/**
 * Prints the Granite models this watsonx account can actually reach.
 *
 * Exists because the project shipped with `ibm/granite-13b-chat-v2` hardcoded —
 * a model IBM withdrew. Never guess a model id again: ask.
 */
async function main() {
  if (!isGraniteConfigured()) {
    console.error('WATSONX_API_KEY and WATSONX_PROJECT_ID must be set in .env');
    process.exit(1);
  }

  const { WatsonXAI } = await import('@ibm-cloud/watsonx-ai');
  const { IamAuthenticator } = await import('ibm-cloud-sdk-core');

  const client = WatsonXAI.newInstance({
    version: '2024-05-31',
    serviceUrl: process.env.WATSONX_URL || 'https://us-south.ml.cloud.ibm.com',
    authenticator: new IamAuthenticator({ apikey: process.env.WATSONX_API_KEY! }),
  });

  const { result } = await client.listFoundationModelSpecs();
  const models = (result.resources ?? []) as Array<{ model_id: string }>;

  const granite = models
    .map((m) => m.model_id)
    .filter((id) => id.toLowerCase().includes('granite'))
    .sort();

  console.log(`\nGranite models available to this account (${granite.length}):\n`);
  for (const id of granite) {
    console.log(`  ${id}${id === getModelId() ? '   <-- WATSONX_MODEL_ID' : ''}`);
  }

  if (!granite.includes(getModelId())) {
    console.log(`\n[WARN] Configured model "${getModelId()}" is NOT in this list.`);
    console.log('       Set WATSONX_MODEL_ID in .env to one of the above.\n');
    process.exit(1);
  }

  console.log('\n[OK] Configured model is available.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
