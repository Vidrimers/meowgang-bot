import Fastify from 'fastify';
import { createReadStream, existsSync } from 'fs';
import { resolve, join, basename } from 'path';
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

  // Отдаём видеофайлы для Instagram API через /auth/video/:filename
  const uploadDir = resolve(process.env.VIDEO_UPLOAD_DIR ?? './temp/videos');
  fastify.get<{ Params: { filename: string } }>('/auth/video/:filename', async (request, reply) => {
    const filename = basename(request.params.filename); // защита от path traversal
    const filePath = join(uploadDir, filename);
    if (!existsSync(filePath)) {
      return reply.code(404).send({ error: 'Not found' });
    }
    reply.header('Content-Type', 'video/mp4');
    return reply.send(createReadStream(filePath));
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
