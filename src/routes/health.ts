import type { FastifyInstance } from 'fastify';

export async function healthRoute(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      status: 'ok',
      version: '0.1.0',
      uptime: Math.floor(process.uptime()),
    };
  });
}
