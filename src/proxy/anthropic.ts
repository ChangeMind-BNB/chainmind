import type { FastifyReply } from 'fastify';
import type { Agent } from '../types/index.js';
import { config } from '../config.js';
import { calculateCost } from '../services/pricing.js';
import { debitAgent } from '../services/billing.js';
import { parseSSEStream, formatSSE } from './stream-handler.js';

interface UsageAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export async function proxyAnthropicStreaming(
  agent: Agent,
  body: Record<string, unknown>,
  reply: FastifyReply,
  routingInfo?: { routed: boolean; requestedModel: string; actualModel: string }
): Promise<void> {
  const model = body.model as string;
  body.stream = true;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    reply.code(upstream.status).send(errorText);
    return;
  }

  // Set SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    ...(routingInfo ? { 'X-ChainMind-Model-Used': routingInfo.actualModel } : {}),
  });

  const usage: UsageAccumulator = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  for await (const event of parseSSEStream(upstream)) {
    // Forward event to client
    reply.raw.write(formatSSE(event.event, event.data));

    if (event.data === '[DONE]') continue;

    try {
      const parsed = JSON.parse(event.data);

      if (parsed.type === 'message_start' && parsed.message?.usage) {
        const u = parsed.message.usage;
        usage.inputTokens = u.input_tokens ?? 0;
        usage.cacheReadTokens = u.cache_read_input_tokens ?? 0;
        usage.cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
      }

      if (parsed.type === 'message_delta' && parsed.usage) {
        usage.outputTokens = parsed.usage.output_tokens ?? 0;
      }
    } catch {
      // Non-JSON data, skip
    }
  }

  // Calculate and debit
  const cost = calculateCost(
    model,
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheWriteTokens,
    usage.cacheReadTokens
  );

  const result = debitAgent({
    agentId: agent.id,
    costMicroUsdc: cost,
    model,
    provider: 'anthropic',
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    routed: routingInfo?.routed,
    requestedModel: routingInfo?.requestedModel,
    actualModel: routingInfo?.actualModel,
  });

  // Send billing event as final SSE
  reply.raw.write(
    formatSSE(
      'billing',
      JSON.stringify({
        cost_usdc: (cost / 1_000_000).toFixed(8),
        balance_remaining: (result.balanceAfterMicroUsdc / 1_000_000).toFixed(6),
        tokens: {
          input: usage.inputTokens,
          output: usage.outputTokens,
          cache_read: usage.cacheReadTokens,
          cache_write: usage.cacheWriteTokens,
        },
      })
    )
  );

  reply.raw.end();
}

export async function proxyAnthropicNonStreaming(
  agent: Agent,
  body: Record<string, unknown>,
  reply: FastifyReply,
  routingInfo?: { routed: boolean; requestedModel: string; actualModel: string }
): Promise<void> {
  const model = body.model as string;
  body.stream = false;

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  const responseBody = await upstream.json();

  if (!upstream.ok) {
    reply.code(upstream.status).send(responseBody);
    return;
  }

  const u = (responseBody as Record<string, any>).usage ?? {};
  const inputTokens = u.input_tokens ?? 0;
  const outputTokens = u.output_tokens ?? 0;
  const cacheReadTokens = u.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = u.cache_creation_input_tokens ?? 0;

  const cost = calculateCost(model, inputTokens, outputTokens, cacheWriteTokens, cacheReadTokens);

  const result = debitAgent({
    agentId: agent.id,
    costMicroUsdc: cost,
    model,
    provider: 'anthropic',
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    routed: routingInfo?.routed,
    requestedModel: routingInfo?.requestedModel,
    actualModel: routingInfo?.actualModel,
  });

  reply
    .header('X-Balance-Remaining', (result.balanceAfterMicroUsdc / 1_000_000).toFixed(6))
    .header('X-Request-Cost', (cost / 1_000_000).toFixed(8))
    .code(upstream.status)
    .send(responseBody);
}
