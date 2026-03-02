export interface Agent {
  id: number;
  apiToken: string;
  depositCode: string;
  balanceMicroUsdc: number;
  isActive: boolean;
  createdAt: string;
}

export interface ModelPricing {
  input: number;    // micro-USDC per 1M tokens
  output: number;   // micro-USDC per 1M tokens
  cache_write?: number;
  cache_read?: number;
}

export type Provider = 'anthropic' | 'openai' | 'openrouter';
export type Tier = 'low' | 'mid' | 'high';

export interface RouteResult {
  model: string;
  provider: Provider;
  estimatedCost: number;
}
