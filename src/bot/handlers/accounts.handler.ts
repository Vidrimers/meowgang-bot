import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { buildCallbackUrl } from '../../services/oauth.service.js';
import { socialAccountRepository } from '../../db/repositories/social-account.repository.js';
import { userRepository } from '../../db/repositories/user.repository.js';

function buildYouTubeAuthUrl(): string {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const redirectUri = encodeURIComponent(buildCallbackUrl('youtube'));
  const scope = encodeURIComponent(
    'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'
  );
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
}

function buildInstagramAuthUrl(): string {
  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const redirectUri = encodeURIComponent(buildCallbackUrl('instagram'));
  const scope = encodeURIComponent('instagram_basic,instagram_content_publish');
  return `https://api.instagram.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
}

function buildTikTokAuthUrl(): string {
  const clientId = process.env.TIKTOK_CLIENT_ID;
  const redirectUri = encodeURIComponent(buildCallbackUrl('tiktok'));
  const scope = encodeURIComponent('video.upload,video.publish');
  return `https://www.tiktok.com/v2/auth/authorize?client_key=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
}

/**
 * Обработчик меню настроек аккаунтов.
 * Показывает статус подключения каждой платформы.
 * Requirements: 5.1, 5.2, 5.3
 */
export async function accountsMenuHandler(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await userRepository.findByTelegramId(telegramId);

  // Проверяем статус подключения каждой платформы
  const [ytAccount, igAccount, ttAccount] = await Promise.all([
    user ? socialAccountRepository.findByUserAndPlatform(user.id, 'youtube') : null,
    user ? socialAccountRepository.findByUserAndPlatform(user.id, 'instagram') : null,
    user ? socialAccountRepository.findByUserAndPlatform(user.id, 'tiktok') : null,
  ]);

  const ytLabel = ytAccount ? '✅ YouTube подключён' : '▶️ Подключить YouTube';
  const igLabel = igAccount ? '✅ Instagram подключён' : '📸 Подключить Instagram';
  const ttLabel = ttAccount ? '✅ TikTok подключён' : '🎵 Подключить TikTok';

  const buttons = [
    [Markup.button.callback(ytLabel, ytAccount ? 'disconnect_youtube' : 'connect_youtube')],
    [Markup.button.callback(igLabel, igAccount ? 'disconnect_instagram' : 'connect_instagram')],
    [Markup.button.callback(ttLabel, ttAccount ? 'disconnect_tiktok' : 'connect_tiktok')],
    [Markup.button.callback('« Назад', 'back_to_main')],
  ];

  await ctx.reply('Настройки аккаунтов:', Markup.inlineKeyboard(buttons));
}

export async function connectYouTubeHandler(ctx: Context): Promise<void> {
  await ctx.reply(`Для подключения YouTube перейдите по ссылке:\n${buildYouTubeAuthUrl()}`);
}

export async function connectInstagramHandler(ctx: Context): Promise<void> {
  await ctx.reply(`Для подключения Instagram перейдите по ссылке:\n${buildInstagramAuthUrl()}`);
}

export async function connectTikTokHandler(ctx: Context): Promise<void> {
  await ctx.reply(`Для подключения TikTok перейдите по ссылке:\n${buildTikTokAuthUrl()}`);
}

/**
 * Отключает аккаунт платформы — удаляет запись из DB.
 */
export async function disconnectPlatformHandler(ctx: Context, platform: 'youtube' | 'instagram' | 'tiktok'): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await userRepository.findByTelegramId(telegramId);
  if (!user) return;

  await socialAccountRepository.deleteByUserAndPlatform(user.id, platform);

  const labels = { youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok' };
  await ctx.reply(`🔌 ${labels[platform]} аккаунт отключён.`);
  await accountsMenuHandler(ctx);
}
