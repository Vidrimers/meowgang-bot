import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { buildCallbackUrl } from '../../services/oauth.service.js';

/**
 * Формирует OAuth URL для YouTube (Google OAuth 2.0).
 * Requirements: 5.1
 */
function buildYouTubeAuthUrl(): string {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const redirectUri = encodeURIComponent(buildCallbackUrl('youtube'));
  const scope = encodeURIComponent(
    'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'
  );
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
}

/**
 * Формирует OAuth URL для Instagram (Meta OAuth 2.0).
 * Requirements: 5.2
 */
function buildInstagramAuthUrl(): string {
  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const redirectUri = encodeURIComponent(buildCallbackUrl('instagram'));
  const scope = encodeURIComponent('instagram_basic,instagram_content_publish');
  return `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
}

/**
 * Формирует OAuth URL для TikTok (TikTok Business OAuth 2.0).
 * Requirements: 5.3
 */
function buildTikTokAuthUrl(): string {
  const clientId = process.env.TIKTOK_CLIENT_ID;
  const redirectUri = encodeURIComponent(buildCallbackUrl('tiktok'));
  const scope = encodeURIComponent('video.upload,video.publish');
  return `https://www.tiktok.com/v2/auth/authorize?client_key=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
}

/**
 * Обработчик меню настроек аккаунтов.
 * Показывает кнопки подключения платформ.
 * Requirements: 5.1, 5.2, 5.3
 */
export async function accountsMenuHandler(ctx: Context): Promise<void> {
  await ctx.reply(
    'Настройки аккаунтов\nВыберите платформу для подключения:',
    Markup.inlineKeyboard([
      [Markup.button.callback('▶️ Подключить YouTube', 'connect_youtube')],
      [Markup.button.callback('📸 Подключить Instagram', 'connect_instagram')],
      [Markup.button.callback('🎵 Подключить TikTok', 'connect_tiktok')],
      [Markup.button.callback('« Назад', 'back_to_main')],
    ])
  );
}

/**
 * Отправляет OAuth-ссылку для YouTube.
 * Requirements: 5.1
 */
export async function connectYouTubeHandler(ctx: Context): Promise<void> {
  const url = buildYouTubeAuthUrl();
  await ctx.reply(
    `Для подключения YouTube перейдите по ссылке:\n${url}`
  );
}

/**
 * Отправляет OAuth-ссылку для Instagram.
 * Requirements: 5.2
 */
export async function connectInstagramHandler(ctx: Context): Promise<void> {
  const url = buildInstagramAuthUrl();
  await ctx.reply(
    `Для подключения Instagram перейдите по ссылке:\n${url}`
  );
}

/**
 * Отправляет OAuth-ссылку для TikTok.
 * Requirements: 5.3
 */
export async function connectTikTokHandler(ctx: Context): Promise<void> {
  const url = buildTikTokAuthUrl();
  await ctx.reply(
    `Для подключения TikTok перейдите по ссылке:\n${url}`
  );
}
