import type { FastifyInstance } from 'fastify';
import type { Telegraf } from 'telegraf';
import { oauthService } from '../../services/oauth.service.js';
import type { Platform } from '../../db/types.js';

/**
 * Регистрирует OAuth callback маршруты для всех платформ.
 * Requirements: 5.8
 */
export async function authRoutes(
  fastify: FastifyInstance,
  options: { bot?: Telegraf }
): Promise<void> {
  const adminTelegramId = Number(process.env.TELEGRAM_ADMIN_ID);
  const { bot } = options;

  const platformLabels: Record<Platform, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    tiktok: 'TikTok',
  };

  async function handleOAuth(platform: Platform, code: string) {
    await oauthService.handleCallback(platform, code, adminTelegramId);

    // Уведомляем Admin в бот
    if (bot) {
      await bot.telegram.sendMessage(
        adminTelegramId,
        `✅ ${platformLabels[platform]} аккаунт успешно подключён!`
      );
    }
  }

  // GET /auth/youtube/callback
  fastify.get('/auth/youtube/callback', async (request, reply) => {
    const { code } = request.query as { code?: string };
    if (!code) return reply.status(400).send({ error: 'Missing code parameter' });
    try {
      await handleOAuth('youtube', code);
      return reply.send({ ok: true, message: 'YouTube аккаунт успешно подключён' });
    } catch (err) {
      fastify.log.error(err, 'YouTube OAuth callback error');
      return reply.status(500).send({ error: 'Failed to handle YouTube callback' });
    }
  });

  // GET /auth/instagram/callback
  fastify.get('/auth/instagram/callback', async (request, reply) => {
    const { code } = request.query as { code?: string };
    if (!code) return reply.status(400).send({ error: 'Missing code parameter' });
    try {
      await handleOAuth('instagram', code);
      return reply.send({ ok: true, message: 'Instagram аккаунт успешно подключён' });
    } catch (err) {
      fastify.log.error(err, 'Instagram OAuth callback error');
      return reply.status(500).send({ error: 'Failed to handle Instagram callback' });
    }
  });

  // GET /auth/tiktok/callback
  fastify.get('/auth/tiktok/callback', async (request, reply) => {
    const { code } = request.query as { code?: string };
    if (!code) return reply.status(400).send({ error: 'Missing code parameter' });
    try {
      await handleOAuth('tiktok', code);
      return reply.send({ ok: true, message: 'TikTok аккаунт успешно подключён' });
    } catch (err) {
      fastify.log.error(err, 'TikTok OAuth callback error');
      return reply.status(500).send({ error: 'Failed to handle TikTok callback' });
    }
  });
}
