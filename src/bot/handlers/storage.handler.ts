import fs from 'fs/promises';
import path from 'path';
import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import pino from 'pino';

const logger = pino({ name: 'storage-handler' });

const VIDEO_UPLOAD_DIR = process.env.VIDEO_UPLOAD_DIR ?? './temp/videos';

/** Форматирует размер в байтах в читаемый вид (KB / MB) */
function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Inline-меню управления папкой загрузок */
const storageMenu = Markup.inlineKeyboard([
  [Markup.button.callback('📋 Список файлов', 'storage_info')],
  [Markup.button.callback('🗑 Очистить папку', 'storage_clear')],
  [Markup.button.callback('🔙 Назад', 'back_to_main')],
]);

/**
 * Показывает список файлов в папке загрузок с размерами и общим объёмом.
 * Requirements: 3.1
 */
export async function storageInfoHandler(ctx: Context): Promise<void> {
  try {
    await fs.mkdir(VIDEO_UPLOAD_DIR, { recursive: true });
    const entries = await fs.readdir(VIDEO_UPLOAD_DIR);

    if (entries.length === 0) {
      await ctx.editMessageText('📁 Папка пуста.', storageMenu);
      return;
    }

    let totalBytes = 0;
    const lines: string[] = [];

    for (const name of entries) {
      const filePath = path.join(VIDEO_UPLOAD_DIR, name);
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          totalBytes += stat.size;
          lines.push(`• ${name} — ${formatSize(stat.size)}`);
        }
      } catch {
        // пропускаем недоступные файлы
      }
    }

    const text =
      `📁 Папка загрузок: ${VIDEO_UPLOAD_DIR}\n\n` +
      lines.join('\n') +
      `\n\n📦 Итого: ${formatSize(totalBytes)} (${lines.length} файл(ов))`;

    try {
      await ctx.editMessageText(text, storageMenu);
    } catch {
      await ctx.reply(text, storageMenu);
    }
  } catch (err) {
    logger.error({ err }, 'Ошибка при чтении папки загрузок');
    await ctx.reply('❌ Не удалось прочитать папку загрузок.');
  }
}

/**
 * Удаляет все файлы из папки загрузок и уведомляет Admin.
 * Requirements: 3.1
 */
export async function storageClearHandler(ctx: Context): Promise<void> {
  try {
    await fs.mkdir(VIDEO_UPLOAD_DIR, { recursive: true });
    const entries = await fs.readdir(VIDEO_UPLOAD_DIR);

    let deleted = 0;
    for (const name of entries) {
      const filePath = path.join(VIDEO_UPLOAD_DIR, name);
      try {
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          await fs.unlink(filePath);
          deleted++;
        }
      } catch (err) {
        logger.warn({ err, filePath }, 'Не удалось удалить файл');
      }
    }

    logger.info({ deleted }, 'Папка загрузок очищена');
    try {
      await ctx.editMessageText(`🗑 Папка очищена. Удалено файлов: ${deleted}.`, storageMenu);
    } catch {
      await ctx.reply(`🗑 Папка очищена. Удалено файлов: ${deleted}.`, storageMenu);
    }
  } catch (err) {
    logger.error({ err }, 'Ошибка при очистке папки загрузок');
    await ctx.reply('❌ Не удалось очистить папку загрузок.');
  }
}
