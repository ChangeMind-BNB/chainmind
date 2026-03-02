import 'dotenv/config';

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),
  host: optional('HOST', '0.0.0.0'),
  baseUrl: optional('BASE_URL', 'http://localhost:3000'),

  // BSC
  bscRpcUrl: required('BSC_RPC_URL'),
  contractAddress: required('CONTRACT_ADDRESS'),
  usdcAddress: optional('USDC_ADDRESS', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'),
  depositPollIntervalMs: parseInt(optional('DEPOSIT_POLL_INTERVAL_MS', '15000'), 10),
  depositConfirmations: parseInt(optional('DEPOSIT_CONFIRMATIONS', '15'), 10),

  // LLM Provider Keys
  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  openaiApiKey: required('OPENAI_API_KEY'),
  openrouterApiKey: required('OPENROUTER_API_KEY'),

  // Billing
  markupPercent: parseInt(optional('MARKUP_PERCENT', '10'), 10),

  // Rate Limiting
  rateLimitMax: parseInt(optional('RATE_LIMIT_MAX', '100'), 10),
  rateLimitWindowMs: parseInt(optional('RATE_LIMIT_WINDOW_MS', '60000'), 10),
} as const;
