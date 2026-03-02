import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const agents = sqliteTable('agents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  apiToken: text('api_token').notNull().unique(),
  depositCode: text('deposit_code').notNull().unique(),
  balanceMicroUsdc: integer('balance_micro_usdc').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: integer('agent_id').notNull().references(() => agents.id),
  type: text('type').notNull(), // 'llm_call' | 'deposit'
  model: text('model'),
  provider: text('provider'), // 'anthropic' | 'openai' | 'openrouter'
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  cacheReadTokens: integer('cache_read_tokens'),
  cacheWriteTokens: integer('cache_write_tokens'),
  costMicroUsdc: integer('cost_micro_usdc').notNull(),
  balanceAfterMicroUsdc: integer('balance_after_micro_usdc').notNull(),
  txHash: text('tx_hash'),
  routed: integer('routed', { mode: 'boolean' }).notNull().default(false),
  requestedModel: text('requested_model'),
  actualModel: text('actual_model'),
  createdAt: text('created_at').notNull(),
});

export const deposits = sqliteTable('deposits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  agentId: integer('agent_id').notNull().references(() => agents.id),
  txHash: text('tx_hash').notNull().unique(),
  fromAddress: text('from_address').notNull(),
  amountMicroUsdc: integer('amount_micro_usdc').notNull(),
  blockNumber: integer('block_number').notNull(),
  confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});
