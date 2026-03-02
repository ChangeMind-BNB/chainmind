import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { proxyAnthropicStreaming, proxyAnthropicNonStreaming } from '../proxy/anthropic.js';
import { proxyOpenaiStreaming, proxyOpenaiNonStreaming } from '../proxy/openai.js';
import { proxyOpenrouterStreaming, proxyOpenrouterNonStreaming } from '../proxy/openrouter.js';
import { routeRequest, estimateTokensFromBody } from '../services/router.js';
import { getProviderForModel, getModelPricing } from '../services/pricing.js';
import type { Tier } from '../types/index.js';

export async function proxyAnthropicRoute(app: FastifyInstance) {
  app.post<{ Params: { token: string } }>(
    '/proxy/:token/v1/messages',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;

      // Smart routing check
      const budgetHeader = request.headers['x-chainmind-budget'] as string | undefined;
      const routeHeader = request.headers['x-chainmind-route'] as string | undefined;
      const tierHeader = (request.headers['x-chainmind-min-tier'] as string | undefined) ?? 'low';

      if (budgetHeader && routeHeader === 'auto') {
        const budget = parseInt(budgetHeader, 10);
        if (isNaN(budget) || budget <= 0) {
          reply.code(400).send({ error: 'Invalid X-ChainMind-Budget value' });
          return;
        }

        const estimatedTokens = estimateTokensFromBody(body);
        const route = routeRequest(budget, estimatedTokens, tierHeader as Tier);

        if (!route) {
          reply.code(402).send({ error: 'Budget too low for any available model' });
          return;
        }

        const requestedModel = (body.model as string) || 'auto';
        body.model = route.model;
        const routingInfo = {
          routed: true,
          requestedModel,
          actualModel: route.model,
        };

        // Route to the correct provider
        return dispatchToProvider(
          route.provider,
          request.agent,
          body,
          reply,
          routingInfo
        );
      }

      // Normal (non-routed) Anthropic proxy
      const isStreaming = body.stream === true;

      if (isStreaming) {
        return proxyAnthropicStreaming(request.agent, body, reply);
      } else {
        return proxyAnthropicNonStreaming(request.agent, body, reply);
      }
    }
  );
}

async function dispatchToProvider(
  provider: string,
  agent: any,
  body: Record<string, unknown>,
  reply: any,
  routingInfo: { routed: boolean; requestedModel: string; actualModel: string }
) {
  const isStreaming = body.stream === true;

  switch (provider) {
    case 'anthropic':
      return isStreaming
        ? proxyAnthropicStreaming(agent, body, reply, routingInfo)
        : proxyAnthropicNonStreaming(agent, body, reply, routingInfo);
    case 'openai':
      // Convert Anthropic message format to OpenAI format for routing
      return isStreaming
        ? proxyOpenaiStreaming(agent, convertToOpenAIFormat(body), reply, routingInfo)
        : proxyOpenaiNonStreaming(agent, convertToOpenAIFormat(body), reply, routingInfo);
    case 'openrouter':
      return isStreaming
        ? proxyOpenrouterStreaming(agent, convertToOpenAIFormat(body), reply, routingInfo)
        : proxyOpenrouterNonStreaming(agent, convertToOpenAIFormat(body), reply, routingInfo);
    default:
      reply.code(500).send({ error: `Unknown provider: ${provider}` });
  }
}

function convertToOpenAIFormat(body: Record<string, unknown>): Record<string, unknown> {
  // Basic conversion from Anthropic to OpenAI message format
  const messages = body.messages as Array<{ role: string; content: unknown }>;
  const systemPrompt = body.system as string | undefined;

  const openaiMessages: Array<{ role: string; content: unknown }> = [];
  if (systemPrompt) {
    openaiMessages.push({ role: 'system', content: systemPrompt });
  }
  if (messages) {
    openaiMessages.push(...messages);
  }

  return {
    model: body.model,
    messages: openaiMessages,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    stream: body.stream,
  };
}
