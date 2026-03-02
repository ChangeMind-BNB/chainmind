import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';

export async function balanceRoute(app: FastifyInstance) {
  app.get<{ Params: { token: string } }>(
    '/proxy/:token/balance',
    { preHandler: authMiddleware },
    async (request) => {
      const agent = request.agent;
      return {
        balance_micro_usdc: agent.balanceMicroUsdc,
        balance_usdc: (agent.balanceMicroUsdc / 1_000_000).toFixed(6),
        deposit_code: agent.depositCode,
        is_active: agent.isActive,
      };
    }
  );
}
