import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { rawDb } from '../db/index.js';

export async function transactionsRoute(app: FastifyInstance) {
  app.get<{ Params: { token: string }; Querystring: { limit?: string; offset?: string } }>(
    '/proxy/:token/transactions',
    { preHandler: authMiddleware },
    async (request) => {
      const limit = Math.min(parseInt(request.query.limit ?? '50', 10), 100);
      const offset = parseInt(request.query.offset ?? '0', 10);

      const rows = rawDb
        .prepare(
          `SELECT * FROM transactions WHERE agent_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`
        )
        .all(request.agent.id, limit, offset) as Array<Record<string, unknown>>;

      const total = rawDb
        .prepare('SELECT COUNT(*) as count FROM transactions WHERE agent_id = ?')
        .get(request.agent.id) as { count: number };

      return {
        transactions: rows.map((row) => ({
          id: row.id,
          type: row.type,
          model: row.model,
          provider: row.provider,
          input_tokens: row.input_tokens,
          output_tokens: row.output_tokens,
          cache_read_tokens: row.cache_read_tokens,
          cache_write_tokens: row.cache_write_tokens,
          cost_micro_usdc: row.cost_micro_usdc,
          cost_usdc: ((row.cost_micro_usdc as number) / 1_000_000).toFixed(6),
          balance_after_usdc: ((row.balance_after_micro_usdc as number) / 1_000_000).toFixed(6),
          tx_hash: row.tx_hash,
          routed: !!row.routed,
          requested_model: row.requested_model,
          actual_model: row.actual_model,
          created_at: row.created_at,
        })),
        total: total.count,
        limit,
        offset,
      };
    }
  );
}
