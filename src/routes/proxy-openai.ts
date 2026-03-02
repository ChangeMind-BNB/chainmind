import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../middleware/auth.js';
import { proxyOpenaiStreaming, proxyOpenaiNonStreaming } from '../proxy/openai.js';
import { proxyOpenrouterStreaming, proxyOpenrouterNonStreaming } from '../proxy/openrouter.js';
import { proxyAnthropicStreaming, proxyAnthropicNonStreaming } from '../proxy/anthropic.js';
import { routeRequest, estimateTokensFromBody } from '../services/router.js';
import type { Tier } from '../types/index.js';

export async function proxyOpenaiRoute(app: FastifyInstance) {
  app.post<{ Params: { token: string } }>(
    '/proxy/:token/v1/chat/completions',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const model = body.model as string;

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

        const requestedModel = model || 'auto';
        body.model = route.model;
        const routingInfo = {
          routed: true,
          requestedModel,
          actualModel: route.model,
        };

        return dispatchToProvider(route.provider, request.agent, body, reply, routingInfo);
      }

      // Detect provider by model prefix
      const isOpenRouter = model.startsWith('openrouter/');
      const isStreaming = body.stream !== false;

      if (isOpenRouter) {
        return isStreaming
          ? proxyOpenrouterStreaming(request.agent, body, reply)
          : proxyOpenrouterNonStreaming(request.agent, body, reply);
      }

      return isStreaming
        ? proxyOpenaiStreaming(request.agent, body, reply)
        : proxyOpenaiNonStreaming(request.agent, body, reply);
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
  const isStreaming = body.stream !== false;

  switch (provider) {
    case 'anthropic':
      // Convert OpenAI format to Anthropic format for routing
      return isStreaming
        ? proxyAnthropicStreaming(agent, convertToAnthropicFormat(body), reply, routingInfo)
        : proxyAnthropicNonStreaming(agent, convertToAnthropicFormat(body), reply, routingInfo);
    case 'openai':
      return isStreaming
        ? proxyOpenaiStreaming(agent, body, reply, routingInfo)
        : proxyOpenaiNonStreaming(agent, body, reply, routingInfo);
    case 'openrouter':
      return isStreaming
        ? proxyOpenrouterStreaming(agent, body, reply, routingInfo)
        : proxyOpenrouterNonStreaming(agent, body, reply, routingInfo);
    default:
      reply.code(500).send({ error: `Unknown provider: ${provider}` });
  }
}

function convertToAnthropicFormat(body: Record<string, unknown>): Record<string, unknown> {
  const messages = body.messages as Array<{ role: string; content: unknown }>;

  let system: string | undefined;
  const anthropicMessages: Array<{ role: string; content: unknown }> = [];

  for (const msg of messages ?? []) {
    if (msg.role === 'system') {
      system = msg.content as string;
    } else {
      anthropicMessages.push(msg);
    }
  }

  return {
    model: body.model,
    messages: anthropicMessages,
    system,
    max_tokens: body.max_tokens ?? 1024,
    temperature: body.temperature,
    stream: body.stream,
  };
}
