import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { userRepository } from '../../db/repositories/user.repository.js';
import { videoRepository } from '../../db/repositories/video.repository.js';
import { postRepository } from '../../db/repositories/post.repository.js';
import type { Video } from '../../db/schema.js';
import type { Post } from '../../db/schema.js';

// Названия платформ для отображения
const PLATFORM_LABELS: Record<string, string> = {
  youtube: '▶️ YouTube',
  instagram: '📸 Instagram',
  tiktok: '🎵 TikTok',
};

/**
 * Форматирует дату в читаемый вид.
 */
function formatDate(date: Date | null): string {
  if (!date) return 'не проверялась';
  return date.toLocaleString('ru-RU', { timeZone: 'UTC' });
}

/**
 * Форматирует строку статистики для одной публикации.
 * Requirements: 10.2
 */
function formatPostStats(post: Post): string {
  const platform = PLATFORM_LABELS[post.platform] ?? post.platform;
  return [
    `  ${platform}`,
    `  ID: ${post.postId}`,
    `  👁 ${post.views} просм. | ❤️ ${post.likes} лайков | 💬 ${post.commentsCount} комм.`,
    `  Обновлено: ${formatDate(post.lastCheckedAt)}`,
  ].join('\n');
}

/**
 * Обработчик кнопки «Показать статистику».
 * Отображает список последних 10 видео с публикациями.
 * Requirements: 10.1, 10.2
 */
export async function statsMenuHandler(ctx: Context): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await userRepository.findByTelegramId(telegramId);
  if (!user) {
    await ctx.reply('Пользователь не найден. Отправьте /start для регистрации.');
    return;
  }

  const recentVideos = await videoRepository.findRecentWithPostsByUserId(user.id, 10);

  if (recentVideos.length === 0) {
    await ctx.reply(
      'Видео не найдены. Загрузите первое видео через кнопку «Загрузить видео».',
      Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'back_to_main')]])
    );
    return;
  }

  // Формируем кнопки для каждого видео
  const buttons = recentVideos.map((video) =>
    [Markup.button.callback(
      `📹 ${video.title.slice(0, 30)}${video.title.length > 30 ? '…' : ''}`,
      `video_stats:${video.id}`
    )]
  );
  buttons.push([Markup.button.callback('« Назад', 'back_to_main')]);

  await ctx.reply(
    `Последние ${recentVideos.length} видео:\nВыберите видео для просмотра детальной статистики:`,
    Markup.inlineKeyboard(buttons)
  );
}

/**
 * Удаляет все Post для видео из БД (когда видео удалено на платформах).
 */
export async function deleteVideoStatsHandler(ctx: Context, videoId: string): Promise<void> {
  const posts = await postRepository.findByVideoId(videoId);

  for (const post of posts) {
    await postRepository.deleteById(post.id);
  }

  await ctx.reply(
    `🗑 Видео удалено из статистики (${posts.length} публикаций).`,
    Markup.inlineKeyboard([[Markup.button.callback('« К списку видео', 'show_stats')]])
  );
}
export async function videoStatsHandler(ctx: Context, videoId: string): Promise<void> {
  const video = await videoRepository.findById(videoId);
  if (!video) {
    await ctx.reply('Видео не найдено.');
    return;
  }

  const videoPosts = await postRepository.findByVideoId(videoId);

  let message = `📹 ${video.title}\n`;
  if (video.description) {
    message += `📝 ${video.description.slice(0, 100)}${video.description.length > 100 ? '…' : ''}\n`;
  }
  message += `📅 Загружено: ${formatDate(video.createdAt)}\n\n`;

  if (videoPosts.length === 0) {
    message += 'Публикации ещё не созданы.';
  } else {
    message += `Публикации (${videoPosts.length}):\n\n`;
    message += videoPosts.map(formatPostStats).join('\n\n');
  }

  await ctx.reply(
    message,
    Markup.inlineKeyboard([
      [Markup.button.callback('🗑 Удалить из статистики', `delete_video_stats:${videoId}`)],
      [Markup.button.callback('« К списку видео', 'show_stats')],
    ])
  );
}
