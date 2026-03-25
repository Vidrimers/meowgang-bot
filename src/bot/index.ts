import { Telegraf } from 'telegraf';
import pino from 'pino';
import { adminOnly } from './middleware/auth.middleware.js';

const logger = pino({ name: 'bot' });

/**
 * Создаёт и настраивает экземпляр Telegraf-бота.
 * Подключает middleware авторизации и глобальные обработчики ошибок.
 */
export function createBot(token: string): Telegraf {
  const bot = new Telegraf(token);

  // Middleware авторизации — первым в цепочке
  bot.use(adminOnly);

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
