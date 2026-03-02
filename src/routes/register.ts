import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { rawDb } from '../db/index.js';
import { generateApiToken, generateDepositCode } from '../utils/token.js';

export async function registerRoute(app: FastifyInstance) {
  app.post('/v1/register', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
      },
    },
  }, async (_request, reply) => {
    const apiToken = generateApiToken();
    const depositCode = generateDepositCode();
    const now = new Date().toISOString();

    rawDb.prepare(`
      INSERT INTO agents (api_token, deposit_code, balance_micro_usdc, is_active, created_at)
      VALUES (?, ?, 0, 0, ?)
    `).run(apiToken, depositCode, now);

    reply.code(201).send({
      api_token: apiToken,
      deposit_code: depositCode,
      status: 'pending_deposit',
      instructions: {
        network: 'BNB Smart Chain (BSC)',
        chain_id: 56,
        contract_address: config.contractAddress,
        usdc_token: config.usdcAddress,
        steps: [
          `1. Approve the contract to spend your USDC: usdc.approve("${config.contractAddress}", amount)`,
          `2. Call deposit(amount, 0x${depositCode.toLowerCase().padEnd(32, '0')}) on the contract`,
          '3. Wait ~45 seconds for confirmation',
        ],
        deposit_url: `${config.baseUrl}/deposit/${depositCode}`,
      },
    });
  });
}
