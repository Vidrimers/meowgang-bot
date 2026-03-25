import Fastify from 'fastify';
import { authRoutes } from './routes/auth.routes.js';

/**
 * Создаёт и настраивает Fastify-сервер.
 * Requirements: 5.8, 13.1
 */
export function createApiServer() {
  const fastify = Fastify({
    logger: true,
  });

  // Регистрируем OAuth callback маршруты
  fastify.register(authRoutes);

  return fastify;
}

/**
 * Запускает ApiServer на PORT из переменных окружения.
 * Requirements: 5.8, 13.1
 */
export async function startApiServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const server = createApiServer();

  await server.listen({ port, host: '0.0.0.0' });
}
