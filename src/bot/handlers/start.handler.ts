import type { Context } from 'telegraf';
import { Markup } from 'telegraf';

/**
 * Обработчик команды /start.
 * Отправляет приветственное сообщение с inline-клавиатурой главного меню.
 * Requirements: 2.1, 2.2
 */
export async function startHandler(ctx: Context): Promise<void> {
  await ctx.reply(
    'Привет! Я бот для публикации видео в социальные сети.\nВыберите действие:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📹 Загрузить видео', 'upload_video')],
      [Markup.button.callback('📊 Показать статистику', 'show_stats')],
      [Markup.button.callback('⚙️ Настройки аккаунтов', 'accounts_settings')],
    ])
  );
}
