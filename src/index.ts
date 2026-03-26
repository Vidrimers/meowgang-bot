import pino from 'pino';
import { validateConfig, getConfig } from './utils/config.js';
import { createBot, registerGlobalErrorHandlers } from './bot/index.js';
import { createApiServer } from './api/server.js';
import { createUploadQueue } from './queue/upload.queue.js';
import { createStatsQueue } from './queue/stats.queue.js';
import { createUploadWorker } from './workers/upload.worker.js';
import { createStatsWorker } from './workers/stats.worker.js';
import { startStatsCronJob } from './queue/cron.js';

// Сначала валидируем конфиг — при отсутствии обязательных переменных process.exit(1)
validateConfig();

const config = getConfig();
const logger = pino({ name: 'app' });

async function main() {
  registerGlobalErrorHandlers();

  // --- Создаём очереди BullMQ ---
  const uploadQueue = createUploadQueue(config.redisUrl);
  const statsQueue = createStatsQueue(config.redisUrl);
  logger.info('Очереди BullMQ инициализированы');

  // --- Создаём и запускаем Bot (Telegraf) ---
  const bot = createBot(config.telegramBotToken, uploadQueue);
  bot.launch();
  logger.info('Telegraf Bot запущен');

  // --- Запускаем ApiServer (Fastify) ---
  const apiServer = createApiServer(bot);
  const port = Number(config.port ?? 3000);
  await apiServer.listen({ port, host: '0.0.0.0' });
  logger.info({ port }, 'ApiServer запущен');

  // --- Запускаем UploadWorker ---
  const uploadWorker = createUploadWorker(config.redisUrl, bot);
  logger.info('UploadWorker запущен');

  // --- Запускаем StatsWorker ---
  const statsWorker = createStatsWorker(config.redisUrl);
  logger.info('StatsWorker запущен');

  // --- Запускаем CronJob (каждые 6 часов) ---
  const cronJob = startStatsCronJob(statsQueue);
  logger.info('CronJob статистики запущен');

  logger.info('Все компоненты успешно запущены');

  // --- Graceful shutdown ---
  async function shutdown(signal: string) {
    logger.info({ signal }, 'Получен сигнал завершения, останавливаем компоненты...');

    // Останавливаем CronJob
    cronJob.stop();
    logger.info('CronJob остановлен');

    // Останавливаем Bot
    bot.stop(signal);
    logger.info('Bot остановлен');

    // Останавливаем воркеры
    await Promise.all([
      uploadWorker.close(),
      statsWorker.close(),
    ]);
    logger.info('Workers остановлены');

    // Закрываем очереди
    await Promise.all([
      uploadQueue.close(),
      statsQueue.close(),
    ]);
    logger.info('Очереди закрыты');

    // Останавливаем ApiServer
    await apiServer.close();
    logger.info('ApiServer остановлен');

    logger.info('Graceful shutdown завершён');
    process.exit(0);
  }

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Критическая ошибка при запуске приложения');
  process.exit(1);
});
