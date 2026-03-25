import { Telegraf } from 'telegraf';
import pino from 'pino';
import { adminOnly } from './middleware/auth.middleware.js';
import { startHandler } from './handlers/start.handler.js';
import {
  statsMenuHandler,
  videoStatsHandler,
} from './handlers/stats.handler.js';
import {
  accountsMenuHandler,
  connectYouTubeHandler,
  connectInstagramHandler,
  connectTikTokHandler,
} from './handlers/accounts.handler.js';

const logger = pino({ name: 'bot' });

/**
 * Создаёт и настраивает экземпляр Telegraf-бота.
 * Подключает middleware авторизации и все обработчики команд/кнопок.
 */
export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  // Middleware авторизации — первым в цепочке
  bot.use(adminOnly);

  // Команда /start — главное меню
  bot.command('start', startHandler);

  // Inline-кнопки главного меню
  bot.action('upload_video', (ctx) => ctx.answerCbQuery());
  bot.action('show_stats', async (ctx) => {
    await ctx.answerCbQuery();
    await statsMenuHandler(ctx);
  });
  bot.action('accounts_settings', async (ctx) => {
    await ctx.answerCbQuery();
    await accountsMenuHandler(ctx);
  });
  bot.action('back_to_main', async (ctx) => {
    await ctx.answerCbQuery();
    await startHandler(ctx);
  });

  // Inline-кнопки статистики — выбор конкретного видео
  bot.action(/^video_stats:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const videoId = (ctx.match as RegExpMatchArray)[1];
    await videoStatsHandler(ctx, videoId);
  });

  // Inline-кнопки подключения аккаунтов
  bot.action('connect_youtube', async (ctx) => {
    await ctx.answerCbQuery();
    await connectYouTubeHandler(ctx);
  });
  bot.action('connect_instagram', async (ctx) => {
    await ctx.answerCbQuery();
    await connectInstagramHandler(ctx);
  });
  bot.action('connect_tiktok', async (ctx) => {
    await ctx.answerCbQuery();
    await connectTikTokHandler(ctx);
  });

  return bot;
}

/**
 * Регистрирует глобальные обработчики необработанных ошибок.
 * Процесс продолжает работу — только логирование.
 */
export function registerGlobalErrorHandlers(): void {
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Необработанное исключение (uncaughtException)');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Необработанный rejection (unhandledRejection)');
  });
}
