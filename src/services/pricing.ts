import type { ModelPricing, Provider } from '../types/index.js';

// All prices in micro-USDC per 1M tokens (10% markup already applied)
export const PRICING: Record<string, ModelPricing & { provider: Provider }> = {
  // Anthropic
  'claude-sonnet-4-6': {
    provider: 'anthropic',
    input: 3_300_000,
    output: 16_500_000,
    cache_write: 4_125_000,
    cache_read: 330_000,
  },
  'claude-opus-4-6': {
    provider: 'anthropic',
    input: 5_500_000,
    output: 27_500_000,
    cache_write: 6_875_000,
    cache_read: 550_000,
  },
  'claude-haiku-4-5-20251001': {
    provider: 'anthropic',
    input: 1_100_000,
    output: 5_500_000,
    cache_write: 1_375_000,
    cache_read: 110_000,
  },
  // OpenAI
  'gpt-4o': {
    provider: 'openai',
    input: 2_750_000,
    output: 11_000_000,
    cache_read: 1_375_000,
  },
  'gpt-4o-mini': {
    provider: 'openai',
    input: 165_000,
    output: 660_000,
    cache_read: 82_500,
  },
  // OpenRouter
  'openrouter/qwen3-max': {
    provider: 'openrouter',
    input: 1_320_000,
    output: 6_600_000,
    cache_read: 264_000,
  },
  'openrouter/grok-4-1-fast': {
    provider: 'openrouter',
    input: 220_000,
    output: 550_000,
    cache_read: 55_000,
  },
  'openrouter/gemini-3.1-pro': {
    provider: 'openrouter',
    input: 2_200_000,
    output: 13_200_000,
    cache_read: 550_000,
  },
};

// Model aliases — map short names to canonical names
const MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4-6-20250610': 'claude-sonnet-4-6',
  'claude-opus-4-6-20250610': 'claude-opus-4-6',
  'claude-sonnet-4-5-20250514': 'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001': 'claude-haiku-4-5-20251001',
};

export function resolveModel(model: string): string {
  return MODEL_ALIASES[model] ?? model;
}

export function getModelPricing(model: string): (ModelPricing & { provider: Provider }) | undefined {
  const resolved = resolveModel(model);
  return PRICING[resolved];
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheWriteTokens: number = 0,
  cacheReadTokens: number = 0
): number {
  const pricing = getModelPricing(model);
  if (!pricing) throw new Error(`Unknown model: ${model}`);

  const inputCost = Math.ceil((inputTokens / 1_000_000) * pricing.input);
  const outputCost = Math.ceil((outputTokens / 1_000_000) * pricing.output);
  const cacheWriteCost = pricing.cache_write
    ? Math.ceil((cacheWriteTokens / 1_000_000) * pricing.cache_write)
    : 0;
  const cacheReadCost = pricing.cache_read
    ? Math.ceil((cacheReadTokens / 1_000_000) * pricing.cache_read)
    : 0;

  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

export function getProviderForModel(model: string): Provider | undefined {
  const pricing = getModelPricing(model);
  return pricing?.provider;
}
