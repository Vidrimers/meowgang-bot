import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import type { Context } from 'telegraf';
import { Markup } from 'telegraf';
import pino from 'pino';
import { userRepository } from '../../db/repositories/user.repository.js';
import { videoRepository } from '../../db/repositories/video.repository.js';
import type { Platform } from '../../db/types.js';

const logger = pino({ name: 'video-handler' });

// Допустимые форматы видео
export const ALLOWED_EXTENSIONS = new Set(['mp4', 'mov', 'avi']);

// Максимальный размер файла в байтах (по умолчанию 2 ГБ)
export const MAX_FILE_SIZE_BYTES = parseInt(
  process.env.MAX_FILE_SIZE_BYTES ?? String(2 * 1024 * 1024 * 1024),
  10
);

// Директория для сохранения видеофайлов
export const VIDEO_UPLOAD_DIR = process.env.VIDEO_UPLOAD_DIR ?? './temp/videos';

// Все поддерживаемые платформы
const ALL_PLATFORMS: Platform[] = ['youtube', 'instagram', 'tiktok'];

// ─── Типы FSM ────────────────────────────────────────────────────────────────

export type VideoFsmStep =
  | 'idle'
  | 'awaiting_title'
  | 'awaiting_description'
  | 'awaiting_tags'
  | 'awaiting_platforms'
  | 'awaiting_confirm';

export interface VideoFsmState {
  step: VideoFsmStep;
  videoId?: string;
  filePath?: string;
  title?: string;
  description?: string;
  tags?: string[];
  platforms?: Platform[];
}

// Хранилище состояний FSM по telegram_id (in-memory, достаточно для одного Admin)
const fsmStore = new Map<number, VideoFsmState>();

export function getFsmState(userId: number): VideoFsmState {
  return fsmStore.get(userId) ?? { step: 'idle' };
}

export function setFsmState(userId: number, state: VideoFsmState): void {
  fsmStore.set(userId, state);
}

export function resetFsmState(userId: number): void {
  fsmStore.set(userId, { step: 'idle' });
}

// ─── Валидация ────────────────────────────────────────────────────────────────

/**
 * Проверяет, допустимо ли расширение файла.
 * Requirements: 3.7
 */
export function isAllowedExtension(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Проверяет, не превышает ли размер файла лимит.
 * Requirements: 3.6
 */
export function isFileSizeAllowed(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE_BYTES;
}

// ─── Скачивание файла ─────────────────────────────────────────────────────────

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    proto.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => {
      fs.unlink(destPath, () => undefined);
      reject(err);
    });
  });
}

// ─── Обработчик входящего видео ───────────────────────────────────────────────

/**
 * Принимает видеофайл от Admin, валидирует формат и размер,
 * сохраняет на ФС, создаёт Video в DB и запускает FSM-диалог.
 * Requirements: 3.1, 3.2, 3.6, 3.7
 */
export async function videoReceiveHandler(ctx: Context): Promise<void> {
  const msg = ctx.message as any;
  const video = msg?.video ?? msg?.document;

  if (!video) {
    await ctx.reply('Пожалуйста, отправьте видеофайл.');
    return;
  }

  const fileName: string = video.file_name ?? `video_${video.file_id}.mp4`;
  const fileSize: number = video.file_size ?? 0;

  // Проверка формата
  if (!isAllowedExtension(fileName)) {
    await ctx.reply(
      '❌ Неподдерживаемый формат файла. Допустимые форматы: MP4, MOV, AVI.'
    );
    return;
  }

  // Проверка размера
  if (!isFileSizeAllowed(fileSize)) {
    const limitMb = Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024);
    await ctx.reply(
      `❌ Файл слишком большой. Максимальный размер: ${limitMb} МБ.`
    );
    return;
  }

  const userId = ctx.from!.id;

  try {
    // Получаем ссылку на файл через Telegram API
    const fileLink = await ctx.telegram.getFileLink(video.file_id);

    // Создаём директорию если не существует
    fs.mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });

    const ext = fileName.split('.').pop()?.toLowerCase() ?? 'mp4';
    const savedFileName = `${Date.now()}_${video.file_id}.${ext}`;
    const destPath = path.join(VIDEO_UPLOAD_DIR, savedFileName);

    await downloadFile(fileLink.href, destPath);
    logger.info({ destPath, fileSize }, 'Видеофайл сохранён на ФС');

    // Находим или создаём пользователя в DB
    const user = await userRepository.findOrCreate(userId);

    // Создаём запись Video в DB с временным title (будет обновлён в FSM)
    const videoRecord = await videoRepository.create({
      userId: user.id,
      filePath: destPath,
      title: '',
      description: '',
      tags: [],
    });

    // Запускаем FSM — первый шаг: запрос title
    setFsmState(userId, {
      step: 'awaiting_title',
      videoId: videoRecord.id,
      filePath: destPath,
    });

    await ctx.reply('✅ Видео получено. Введите название публикации:');
  } catch (err) {
    logger.error({ err }, 'Ошибка при сохранении видеофайла');
    await ctx.reply('❌ Ошибка при сохранении файла. Попробуйте ещё раз.');
  }
}

// ─── FSM: обработка текстовых сообщений ──────────────────────────────────────

/**
 * Обрабатывает текстовые сообщения в рамках FSM-диалога.
 * Requirements: 3.2, 3.3, 3.4, 3.5
 */
export async function videoFsmTextHandler(ctx: Context): Promise<boolean> {
  const userId = ctx.from!.id;
  const state = getFsmState(userId);
  const text = (ctx.message as any)?.text as string | undefined;

  if (!text) return false;

  switch (state.step) {
    case 'awaiting_title': {
      setFsmState(userId, { ...state, step: 'awaiting_description', title: text });
      await ctx.reply('Введите описание публикации:');
      return true;
    }

    case 'awaiting_description': {
      setFsmState(userId, { ...state, step: 'awaiting_tags', description: text });
      await ctx.reply('Введите теги через запятую (например: кот, смешное, видео):');
      return true;
    }

    case 'awaiting_tags': {
      const tags = text
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      // Сохраняем метаданные в DB
      await videoRepository.updateMetadata(state.videoId!, {
        title: state.title!,
        description: state.description!,
        tags,
      });

      setFsmState(userId, { ...state, step: 'awaiting_platforms', tags });

      await ctx.reply(
        'Выберите платформы для загрузки:',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('▶️ YouTube', 'platform_youtube'),
            Markup.button.callback('📸 Instagram', 'platform_instagram'),
            Markup.button.callback('🎵 TikTok', 'platform_tiktok'),
          ],
          [Markup.button.callback('✅ Все платформы', 'platform_all')],
          [Markup.button.callback('➡️ Далее', 'platform_confirm_selection')],
        ])
      );
      return true;
    }

    default:
      return false;
  }
}

// ─── FSM: обработка выбора платформ ──────────────────────────────────────────

/**
 * Обрабатывает нажатия inline-кнопок выбора платформ.
 */
export async function platformToggleHandler(
  ctx: Context,
  platformOrAction: string
): Promise<void> {
  const userId = ctx.from!.id;
  const state = getFsmState(userId);

  if (state.step !== 'awaiting_platforms') return;

  let platforms: Platform[] = state.platforms ?? [];

  if (platformOrAction === 'all') {
    platforms = [...ALL_PLATFORMS];
  } else if (ALL_PLATFORMS.includes(platformOrAction as Platform)) {
    const p = platformOrAction as Platform;
    if (platforms.includes(p)) {
      platforms = platforms.filter((x) => x !== p);
    } else {
      platforms = [...platforms, p];
    }
  }

  setFsmState(userId, { ...state, platforms });

  const selected = platforms.length > 0 ? platforms.join(', ') : 'не выбрано';
  await ctx.editMessageText(
    `Выберите платформы для загрузки:\nВыбрано: ${selected}`,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('▶️ YouTube', 'platform_youtube'),
        Markup.button.callback('📸 Instagram', 'platform_instagram'),
        Markup.button.callback('🎵 TikTok', 'platform_tiktok'),
      ],
      [Markup.button.callback('✅ Все платформы', 'platform_all')],
      [Markup.button.callback('➡️ Далее', 'platform_confirm_selection')],
    ])
  );
}

/**
 * Переход к шагу подтверждения после выбора платформ.
 */
export async function platformConfirmSelectionHandler(ctx: Context): Promise<void> {
  const userId = ctx.from!.id;
  const state = getFsmState(userId);

  if (state.step !== 'awaiting_platforms') return;

  if (!state.platforms || state.platforms.length === 0) {
    await ctx.answerCbQuery('Выберите хотя бы одну платформу!', { show_alert: true });
    return;
  }

  setFsmState(userId, { ...state, step: 'awaiting_confirm' });

  const platformLabels: Record<Platform, string> = {
    youtube: '▶️ YouTube',
    instagram: '📸 Instagram',
    tiktok: '🎵 TikTok',
  };

  const platformsList = state.platforms.map((p) => platformLabels[p]).join(', ');

  await ctx.editMessageText(
    `📋 Подтвердите публикацию:\n\n` +
      `📌 Название: ${state.title}\n` +
      `📝 Описание: ${state.description}\n` +
      `🏷 Теги: ${state.tags?.join(', ') || '—'}\n` +
      `📡 Платформы: ${platformsList}`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Подтвердить', 'video_upload_confirm')],
      [Markup.button.callback('❌ Отмена', 'video_upload_cancel')],
    ])
  );
}

/**
 * Финальное подтверждение — возвращает данные для постановки в очередь.
 * Сброс FSM после подтверждения.
 */
export async function videoUploadConfirmHandler(
  ctx: Context,
  onConfirm: (videoId: string, platforms: Platform[]) => Promise<void>
): Promise<void> {
  const userId = ctx.from!.id;
  const state = getFsmState(userId);

  if (state.step !== 'awaiting_confirm') return;

  resetFsmState(userId);

  await onConfirm(state.videoId!, state.platforms!);
}

/**
 * Отмена загрузки — сброс FSM.
 */
export async function videoUploadCancelHandler(ctx: Context): Promise<void> {
  const userId = ctx.from!.id;
  resetFsmState(userId);
  await ctx.editMessageText('❌ Загрузка отменена.');
}
