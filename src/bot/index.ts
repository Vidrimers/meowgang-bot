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
import {
  storageInfoHandler,
  storageClearHandler,
} from './handlers/storage.handler.js';
import {
  videoReceiveHandler,
  videoFsmTextHandler,
  platformToggleHandler,
  platformConfirmSelectionHandler,
  videoUploadConfirmHandler,
  videoUploadCancelHandler,
} from './handlers/video.handler.js';
import {
  createUploadQueue,
  UPLOAD_JOB_OPTIONS,
} from '../queue/upload.queue.js';
import type { Queue } from 'bullmq';
import type { UploadJobData } from '../queue/upload.queue.js';

const logger = pino({ name: 'bot' });

/**
 * Создаёт и настраивает экземпляр Telegraf-бота.
 * Подключает middleware авторизации и все обработчики команд/кнопок.
 */
export function createBot(token: string, uploadQueue?: Queue<UploadJobData>): Telegraf {
  const bot = new Telegraf(token);

  // Middleware авторизации — первым в цепочке
  bot.use(adminOnly);

  // Команда /start — главное меню
  bot.command('start', startHandler);

  // Приём видеофайлов и документов (для форматов MOV/AVI)
  bot.on('video', videoReceiveHandler);
  bot.on('document', videoReceiveHandler);

  // FSM: текстовые сообщения (title → description → tags)
  bot.on('text', async (ctx, next) => {
    const handled = await videoFsmTextHandler(ctx);
    if (!handled) return next();
  });

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

  // Inline-кнопки управления папкой загрузок
  bot.action('storage_info', async (ctx) => {
    await ctx.answerCbQuery();
    await storageInfoHandler(ctx);
  });
  bot.action('storage_clear', async (ctx) => {
    await ctx.answerCbQuery();
    await storageClearHandler(ctx);
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

  // Inline-кнопки выбора платформ (FSM)
  bot.action('platform_youtube', async (ctx) => {
    await ctx.answerCbQuery();
    await platformToggleHandler(ctx, 'youtube');
  });
  bot.action('platform_instagram', async (ctx) => {
    await ctx.answerCbQuery();
    await platformToggleHandler(ctx, 'instagram');
  });
  bot.action('platform_tiktok', async (ctx) => {
    await ctx.answerCbQuery();
    await platformToggleHandler(ctx, 'tiktok');
  });
  bot.action('platform_all', async (ctx) => {
    await ctx.answerCbQuery();
    await platformToggleHandler(ctx, 'all');
  });
  bot.action('platform_confirm_selection', async (ctx) => {
    await ctx.answerCbQuery();
    await platformConfirmSelectionHandler(ctx);
  });

  // Подтверждение / отмена загрузки
  bot.action('video_upload_confirm', async (ctx) => {
    await ctx.answerCbQuery();
    await videoUploadConfirmHandler(ctx, async (videoId, platforms) => {
      if (!uploadQueue) {
        logger.error('UploadQueue не инициализирована');
        await ctx.reply('❌ Ошибка: очередь загрузки недоступна.');
        return;
      }
      try {
        await uploadQueue.add(
          'uploadVideo',
          { videoId, platforms },
          UPLOAD_JOB_OPTIONS
        );
        logger.info({ videoId, platforms }, 'Задача добавлена в UploadQueue');
        await ctx.reply(
          `✅ Загрузка поставлена в очередь.\nПлатформы: ${platforms.join(', ')}`
        );
      } catch (err) {
        logger.error({ err, videoId }, 'Ошибка постановки задачи в UploadQueue');
        await ctx.reply('❌ Не удалось поставить задачу в очередь. Попробуйте ещё раз.');
      }
    });
  });
  bot.action('video_upload_cancel', async (ctx) => {
    await ctx.answerCbQuery();
    await videoUploadCancelHandler(ctx);
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
