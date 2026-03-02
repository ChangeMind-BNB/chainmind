import type { Provider, Tier, RouteResult } from '../types/index.js';
import { PRICING } from './pricing.js';

interface ModelEntry {
  model: string;
  provider: Provider;
  tier: Tier;
  estimatedCostPerMTok: number; // combined input + output for ranking
}

// Model priority order (cheapest to most expensive)
const MODEL_ORDER: ModelEntry[] = [
  {
    model: 'gpt-4o-mini',
    provider: 'openai',
    tier: 'low',
    estimatedCostPerMTok: 165_000 + 660_000,
  },
  {
    model: 'openrouter/grok-4-1-fast',
    provider: 'openrouter',
    tier: 'low',
    estimatedCostPerMTok: 220_000 + 550_000,
  },
  {
    model: 'claude-haiku-4-5-20251001',
    provider: 'anthropic',
    tier: 'low',
    estimatedCostPerMTok: 1_100_000 + 5_500_000,
  },
  {
    model: 'openrouter/qwen3-max',
    provider: 'openrouter',
    tier: 'mid',
    estimatedCostPerMTok: 1_320_000 + 6_600_000,
  },
  {
    model: 'openrouter/gemini-3.1-pro',
    provider: 'openrouter',
    tier: 'mid',
    estimatedCostPerMTok: 2_200_000 + 13_200_000,
  },
  {
    model: 'gpt-4o',
    provider: 'openai',
    tier: 'high',
    estimatedCostPerMTok: 2_750_000 + 11_000_000,
  },
  {
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    tier: 'high',
    estimatedCostPerMTok: 3_300_000 + 16_500_000,
  },
  {
    model: 'claude-opus-4-6',
    provider: 'anthropic',
    tier: 'high',
    estimatedCostPerMTok: 5_500_000 + 27_500_000,
  },
];

const TIER_MINIMUM: Record<Tier, Tier[]> = {
  low: ['low', 'mid', 'high'],
  mid: ['mid', 'high'],
  high: ['high'],
};

export function estimateTokensFromBody(body: unknown): number {
  // Rough estimate: ~4 characters per token
  const bodyStr = JSON.stringify(body);
  return Math.ceil(bodyStr.length / 4);
}

export function routeRequest(
  budgetMicroUsdc: number,
  estimatedInputTokens: number,
  minTier: Tier = 'low'
): RouteResult | null {
  // Default output estimate: 2x input or 1024, whichever is larger
  const estimatedOutputTokens = Math.max(estimatedInputTokens * 2, 1024);
  const allowedTiers = TIER_MINIMUM[minTier];

  for (const entry of MODEL_ORDER) {
    if (!allowedTiers.includes(entry.tier)) continue;

    const pricing = PRICING[entry.model];
    if (!pricing) continue;

    const inputCost = Math.ceil((estimatedInputTokens / 1_000_000) * pricing.input);
    const outputCost = Math.ceil((estimatedOutputTokens / 1_000_000) * pricing.output);
    const totalCost = inputCost + outputCost;

    if (totalCost <= budgetMicroUsdc) {
      return {
        model: entry.model,
        provider: entry.provider,
        estimatedCost: totalCost,
      };
    }
  }

  return null;
}
