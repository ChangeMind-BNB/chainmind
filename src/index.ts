import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { healthRoute } from './routes/health.js';
import { registerRoute } from './routes/register.js';
import { pricingRoute } from './routes/pricing.js';
import { balanceRoute } from './routes/balance.js';
import { transactionsRoute } from './routes/transactions.js';
import { proxyAnthropicRoute } from './routes/proxy-anthropic.js';
import { proxyOpenaiRoute } from './routes/proxy-openai.js';
import { startDepositWatcher } from './services/deposit-watcher.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = Fastify({
  logger: true,
  bodyLimit: 1_048_576, // 1MB
});

// Plugins
await app.register(fastifyCors, { origin: true });
await app.register(fastifyRateLimit, {
  max: config.rateLimitMax,
  timeWindow: config.rateLimitWindowMs,
});

// Static files
await app.register(fastifyStatic, {
  root: join(__dirname, '..', 'public'),
  prefix: '/',
});

// Routes
await app.register(healthRoute);
await app.register(registerRoute);
await app.register(pricingRoute);
await app.register(balanceRoute);
await app.register(transactionsRoute);
await app.register(proxyAnthropicRoute);
await app.register(proxyOpenaiRoute);

// Start deposit watcher
startDepositWatcher();

// Start server
try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`ChainMind running on ${config.host}:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
