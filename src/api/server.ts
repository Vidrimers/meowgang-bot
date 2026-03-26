import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { resolve } from 'path';
import type { Telegraf } from 'telegraf';
import { authRoutes } from './routes/auth.routes.js';

/**
 * Создаёт и настраивает Fastify-сервер.
 * Requirements: 5.8, 13.1
 */
export function createApiServer(bot?: Telegraf) {
  const fastify = Fastify({
    logger: true,
  });

  // Регистрируем OAuth callback маршруты
  fastify.register(authRoutes, { bot });

  // Отдаём видеофайлы по публичному URL для Instagram API
  const uploadDir = resolve(process.env.VIDEO_UPLOAD_DIR ?? './temp/videos');
  fastify.register(fastifyStatic, {
    root: uploadDir,
    prefix: '/uploads/',
  });

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
