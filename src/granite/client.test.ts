import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getModelId,
  isGraniteConfigured,
  graniteChat,
  GraniteNotConfiguredError,
} from './client';

describe('Granite client configuration', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.WATSONX_API_KEY;
    delete process.env.WATSONX_PROJECT_ID;
    delete process.env.WATSONX_MODEL_ID;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('reports not configured when credentials are absent', () => {
    expect(isGraniteConfigured()).toBe(false);
  });

  it('reports configured when both credentials are present', () => {
    process.env.WATSONX_API_KEY = 'key';
    process.env.WATSONX_PROJECT_ID = 'proj';
    expect(isGraniteConfigured()).toBe(true);
  });

  it('defaults to a current Granite model, not the withdrawn granite-13b-chat-v2', () => {
    expect(getModelId()).toBe('ibm/granite-3-3-8b-instruct');
    expect(getModelId()).not.toContain('13b-chat-v2');
  });

  it('honours WATSONX_MODEL_ID when set', () => {
    process.env.WATSONX_MODEL_ID = 'ibm/granite-4-1-8b-instruct';
    expect(getModelId()).toBe('ibm/granite-4-1-8b-instruct');
  });

  it('throws a named, actionable error rather than calling the network unconfigured', async () => {
    await expect(graniteChat('hello')).rejects.toThrow(GraniteNotConfiguredError);
    await expect(graniteChat('hello')).rejects.toThrow(/WATSONX_API_KEY/);
  });
});
