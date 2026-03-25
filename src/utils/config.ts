import dotenv from 'dotenv';

// Загружаем .env при импорте модуля
dotenv.config();

// Список всех обязательных переменных окружения
export const REQUIRED_ENV_VARS: string[] = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_ADMIN_ID',
  'DATABASE_URL',
  'REDIS_URL',
  'YOUTUBE_CLIENT_ID',
  'YOUTUBE_CLIENT_SECRET',
  'INSTAGRAM_CLIENT_ID',
  'INSTAGRAM_CLIENT_SECRET',
  'TIKTOK_CLIENT_ID',
  'TIKTOK_CLIENT_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'SERVER_IP',
  'PORT',
];

/**
 * Проверяет наличие всех обязательных переменных окружения.
 * При отсутствии любой из них — выводит сообщение об ошибке и завершает процесс.
 */
export function validateConfig(): void {
  const missing: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  if (missing.length > 0) {
    console.error(
      `Ошибка конфигурации: отсутствуют обязательные переменные окружения: ${missing.join(', ')}`
    );
    process.exit(1);
  }
}

/**
 * Возвращает типизированный объект конфигурации.
 * Вызывать только после validateConfig().
 */
export function getConfig() {
  return {
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN as string,
    telegramAdminId: process.env.TELEGRAM_ADMIN_ID as string,
    databaseUrl: process.env.DATABASE_URL as string,
    redisUrl: process.env.REDIS_URL as string,
    youtubeClientId: process.env.YOUTUBE_CLIENT_ID as string,
    youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET as string,
    instagramClientId: process.env.INSTAGRAM_CLIENT_ID as string,
    instagramClientSecret: process.env.INSTAGRAM_CLIENT_SECRET as string,
    tiktokClientId: process.env.TIKTOK_CLIENT_ID as string,
    tiktokClientSecret: process.env.TIKTOK_CLIENT_SECRET as string,
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY as string,
    serverIp: process.env.SERVER_IP as string,
    port: process.env.PORT as string,
  };
}
