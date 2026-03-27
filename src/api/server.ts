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

  // Страницы Terms of Service и Privacy Policy для TikTok App Review
  fastify.get('/auth/terms', async (_request, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Terms of Service — myMeowGang</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}</style></head><body><h1>Terms of Service</h1><p>Last updated: March 2026</p><h2>1. Acceptance of Terms</h2><p>By using myMeowGang ("the Service"), you agree to these Terms of Service. The Service is a tool for managing and publishing video content to social media platforms.</p><h2>2. Use of Service</h2><p>The Service is intended for personal use to publish video content to connected social media accounts. You are responsible for all content you publish through the Service.</p><h2>3. Third-Party Platforms</h2><p>The Service integrates with third-party platforms (YouTube, Instagram, TikTok). Use of these platforms is subject to their respective terms of service.</p><h2>4. Data</h2><p>The Service stores OAuth tokens required to publish content on your behalf. Tokens are encrypted and stored securely.</p><h2>5. Limitation of Liability</h2><p>The Service is provided "as is" without warranties of any kind. We are not liable for any damages arising from use of the Service.</p><h2>6. Contact</h2><p>For questions, contact: vidrimers2@gmail.com</p></body></html>`);
  });

  fastify.get('/auth/privacy', async (_request, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Privacy Policy — myMeowGang</title><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6}</style></head><body><h1>Privacy Policy</h1><p>Last updated: March 2026</p><h2>1. Information We Collect</h2><p>The Service collects and stores OAuth access tokens and refresh tokens for connected social media accounts (YouTube, Instagram, TikTok). Tokens are encrypted using AES-256-GCM.</p><h2>2. How We Use Information</h2><p>Tokens are used solely to publish video content to your connected social media accounts on your behalf. We do not share your data with third parties.</p><h2>3. Data Storage</h2><p>Data is stored in a PostgreSQL database on a private server. Access tokens are encrypted at rest.</p><h2>4. Data Deletion</h2><p>You can disconnect any social media account at any time through the Service, which will delete the associated tokens from our database.</p><h2>5. Third-Party Services</h2><p>The Service uses YouTube Data API, Meta Graph API, and TikTok API. Please review their privacy policies for information on how they handle your data.</p><h2>6. Contact</h2><p>For privacy-related questions, contact: vidrimers2@gmail.com</p></body></html>`);
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
