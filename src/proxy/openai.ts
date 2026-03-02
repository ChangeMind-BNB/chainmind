import type { FastifyReply } from 'fastify';
import type { Agent } from '../types/index.js';
import { config } from '../config.js';
import { calculateCost } from '../services/pricing.js';
import { debitAgent } from '../services/billing.js';
import { parseSSEStream, formatSSE } from './stream-handler.js';

export async function proxyOpenaiStreaming(
  agent: Agent,
  body: Record<string, unknown>,
  reply: FastifyReply,
  routingInfo?: { routed: boolean; requestedModel: string; actualModel: string }
): Promise<void> {
  const model = body.model as string;
  body.stream = true;
  // Request usage in streaming mode
  body.stream_options = { include_usage: true };

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text();
    reply.code(upstream.status).send(errorText);
    return;
  }

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    ...(routingInfo ? { 'X-ChainMind-Model-Used': routingInfo.actualModel } : {}),
  });

  let promptTokens = 0;
  let completionTokens = 0;
  let cachedTokens = 0;

  for await (const event of parseSSEStream(upstream)) {
    reply.raw.write(formatSSE(event.event, event.data));

    if (event.data === '[DONE]') continue;

    try {
      const parsed = JSON.parse(event.data);
      // OpenAI sends usage in the final chunk (choices is empty array)
      if (parsed.usage) {
        promptTokens = parsed.usage.prompt_tokens ?? 0;
        completionTokens = parsed.usage.completion_tokens ?? 0;
        cachedTokens = parsed.usage.prompt_tokens_details?.cached_tokens ?? 0;
      }
    } catch {
      // Non-JSON, skip
    }
  }

  const cost = calculateCost(
    model,
    promptTokens - cachedTokens, // non-cached input tokens
    completionTokens,
    0,
    cachedTokens
  );

  const result = debitAgent({
    agentId: agent.id,
    costMicroUsdc: cost,
    model,
    provider: 'openai',
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    cacheReadTokens: cachedTokens,
    routed: routingInfo?.routed,
    requestedModel: routingInfo?.requestedModel,
    actualModel: routingInfo?.actualModel,
  });

  reply.raw.write(
    formatSSE(
      'billing',
      JSON.stringify({
        cost_usdc: (cost / 1_000_000).toFixed(8),
        balance_remaining: (result.balanceAfterMicroUsdc / 1_000_000).toFixed(6),
        tokens: { input: promptTokens, output: completionTokens, cached: cachedTokens },
      })
    )
  );

  reply.raw.end();
}

export async function proxyOpenaiNonStreaming(
  agent: Agent,
  body: Record<string, unknown>,
  reply: FastifyReply,
  routingInfo?: { routed: boolean; requestedModel: string; actualModel: string }
): Promise<void> {
  const model = body.model as string;
  body.stream = false;

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify(body),
  });

  const responseBody = await upstream.json();

  if (!upstream.ok) {
    reply.code(upstream.status).send(responseBody);
    return;
  }

  const u = (responseBody as Record<string, any>).usage ?? {};
  const promptTokens = u.prompt_tokens ?? 0;
  const completionTokens = u.completion_tokens ?? 0;
  const cachedTokens = u.prompt_tokens_details?.cached_tokens ?? 0;

  const cost = calculateCost(model, promptTokens - cachedTokens, completionTokens, 0, cachedTokens);

  const result = debitAgent({
    agentId: agent.id,
    costMicroUsdc: cost,
    model,
    provider: 'openai',
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    cacheReadTokens: cachedTokens,
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
