import type { FastifyRequest, FastifyReply } from 'fastify';
import { rawDb } from '../db/index.js';
import type { Agent } from '../types/index.js';

declare module 'fastify' {
  interface FastifyRequest {
    agent: Agent;
  }
}

export async function authMiddleware(
  request: FastifyRequest<{ Params: { token: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { token } = request.params;

  const agent = rawDb.prepare('SELECT * FROM agents WHERE api_token = ?').get(token) as
    | {
        id: number;
        api_token: string;
        deposit_code: string;
        balance_micro_usdc: number;
        is_active: number;
        created_at: string;
      }
    | undefined;

  if (!agent) {
    reply.code(401).send({ error: 'Invalid API token' });
    return;
  }

  if (!agent.is_active) {
    reply.code(401).send({ error: 'Account not active. Deposit USDC to activate.' });
    return;
  }

  // Minimum balance check: 10000 micro-USDC = $0.01
  if (agent.balance_micro_usdc < 10000) {
    reply.code(402).send({
      error: 'Insufficient balance',
      balance_usdc: (agent.balance_micro_usdc / 1_000_000).toFixed(6),
    });
    return;
  }

  request.agent = {
    id: agent.id,
    apiToken: agent.api_token,
    depositCode: agent.deposit_code,
    balanceMicroUsdc: agent.balance_micro_usdc,
    isActive: !!agent.is_active,
    createdAt: agent.created_at,
  };
}
