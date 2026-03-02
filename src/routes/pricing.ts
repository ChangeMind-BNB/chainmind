import type { FastifyInstance } from 'fastify';
import { PRICING } from '../services/pricing.js';

export async function pricingRoute(app: FastifyInstance) {
  app.get('/v1/pricing', async () => {
    const models: Record<string, unknown> = {};

    for (const [model, pricing] of Object.entries(PRICING)) {
      models[model] = {
        provider: pricing.provider,
        per_1m_tokens: {
          input: pricing.input,
          output: pricing.output,
          cache_write: pricing.cache_write ?? null,
          cache_read: pricing.cache_read ?? null,
        },
        per_1m_tokens_usdc: {
          input: (pricing.input / 1_000_000).toFixed(2),
          output: (pricing.output / 1_000_000).toFixed(2),
          cache_write: pricing.cache_write ? (pricing.cache_write / 1_000_000).toFixed(2) : null,
          cache_read: pricing.cache_read ? (pricing.cache_read / 1_000_000).toFixed(2) : null,
        },
      };
    }

    return {
      currency: 'USDC',
      unit: 'micro-USDC (1 USDC = 1,000,000)',
      markup: '10%',
      note: 'Cache write tokens billed at 1.25x input rate; cache read tokens at 0.10x input rate.',
      models,
    };
  });
}
