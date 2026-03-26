import type { Context } from 'telegraf';
import { Markup } from 'telegraf';

/**
 * Показывает inline-клавиатуру главного меню.
 */
export async function showMainMenu(ctx: Context): Promise<void> {
  await ctx.reply(
    'Выберите действие:',
    Markup.inlineKeyboard([
      [Markup.button.callback('📹 Загрузить видео', 'upload_video')],
      [Markup.button.callback('📊 Показать статистику', 'show_stats')],
      [Markup.button.callback('⚙️ Настройки аккаунтов', 'accounts_settings')],
      [Markup.button.callback('📁 Папка загрузок', 'storage_info')],
    ])
  );
}

/**
 * Обработчик команды /start и /menu.
 * Убирает reply-клавиатуру если она была, показывает inline-меню.
 * Requirements: 2.1, 2.2
 */
export async function startHandler(ctx: Context): Promise<void> {
  // Убираем reply-клавиатуру если она осталась от предыдущей версии
  await ctx.reply('👋', Markup.removeKeyboard());
  await showMainMenu(ctx);
}
