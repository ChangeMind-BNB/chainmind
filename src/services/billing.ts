import { rawDb } from '../db/index.js';

interface DebitParams {
  agentId: number;
  costMicroUsdc: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  routed?: boolean;
  requestedModel?: string;
  actualModel?: string;
}

interface DebitResult {
  success: boolean;
  balanceAfterMicroUsdc: number;
  error?: string;
}

const debitStatement = rawDb.prepare(
  'UPDATE agents SET balance_micro_usdc = balance_micro_usdc - ? WHERE id = ? AND balance_micro_usdc >= ?'
);

const getBalanceStatement = rawDb.prepare(
  'SELECT balance_micro_usdc FROM agents WHERE id = ?'
);

const insertTransactionStatement = rawDb.prepare(`
  INSERT INTO transactions (
    agent_id, type, model, provider,
    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
    cost_micro_usdc, balance_after_micro_usdc,
    routed, requested_model, actual_model,
    created_at
  ) VALUES (?, 'llm_call', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function debitAgent(params: DebitParams): DebitResult {
  const {
    agentId,
    costMicroUsdc,
    model,
    provider,
    inputTokens,
    outputTokens,
    cacheReadTokens = 0,
    cacheWriteTokens = 0,
    routed = false,
    requestedModel,
    actualModel,
  } = params;

  // Use BEGIN IMMEDIATE to prevent race conditions
  const debitTx = rawDb.transaction(() => {
    const result = debitStatement.run(costMicroUsdc, agentId, costMicroUsdc);

    if (result.changes === 0) {
      const current = getBalanceStatement.get(agentId) as { balance_micro_usdc: number } | undefined;
      return {
        success: false,
        balanceAfterMicroUsdc: current?.balance_micro_usdc ?? 0,
        error: 'Insufficient balance',
      };
    }

    const updated = getBalanceStatement.get(agentId) as { balance_micro_usdc: number };
    const now = new Date().toISOString();

    insertTransactionStatement.run(
      agentId,
      model,
      provider,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      costMicroUsdc,
      updated.balance_micro_usdc,
      routed ? 1 : 0,
      requestedModel ?? null,
      actualModel ?? null,
      now
    );

    return {
      success: true,
      balanceAfterMicroUsdc: updated.balance_micro_usdc,
    };
  });

  // better-sqlite3 transactions use BEGIN IMMEDIATE by default
  return debitTx() as DebitResult;
}
