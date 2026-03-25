import { Worker, type Job } from 'bullmq';
import { unlink } from 'fs/promises';
import pino from 'pino';
import type { Telegraf } from 'telegraf';
import { youtubeService } from '../services/youtube.service.js';
import { instagramService } from '../services/instagram.service.js';
import { tiktokService } from '../services/tiktok.service.js';
import { videoRepository } from '../db/repositories/video.repository.js';
import type { UploadJobData } from '../queue/upload.queue.js';

const logger = pino({ name: 'upload-worker' });

/**
 * Создаёт и запускает UploadWorker — обработчик задач из очереди uploadVideo.
 * Retry-логика задаётся в UPLOAD_JOB_OPTIONS (attempts: 3, exponential backoff).
 * После успешной публикации на всех платформах удаляет видеофайл с диска.
 * Requirements: 6.4, 6.5, 7.5, 7.6, 8.5, 8.6, 12.2
 */
export function createUploadWorker(redisUrl: string, bot: Telegraf): Worker<UploadJobData> {
  const url = new URL(redisUrl);
  const adminId = process.env.TELEGRAM_ADMIN_ID;

  const worker = new Worker<UploadJobData>(
    'uploadVideo',
    async (job: Job<UploadJobData>) => {
      const { videoId, platforms } = job.data;

      logger.info({ jobId: job.id, videoId, platforms }, 'Начало обработки задачи загрузки');

      // Получаем запись видео из DB
      const video = await videoRepository.findById(videoId);
      if (!video) {
        throw new Error(`Видео не найдено: ${videoId}`);
      }

      // Получаем userId для получения OAuth-токенов
      const userId = video.userId;

      const metadata = {
        title: video.title,
        description: video.description,
        tags: video.tags,
      };

      const errors: Array<{ platform: string; error: unknown }> = [];

      // Загружаем на каждую выбранную платформу
      for (const platform of platforms) {
        try {
          if (platform === 'youtube') {
            await youtubeService.uploadVideo(video.filePath, metadata, videoId, userId, bot);
          } else if (platform === 'instagram') {
            const caption = [video.title, video.description].filter(Boolean).join('\n\n');
            await instagramService.uploadReel(video.filePath, caption, videoId, userId, bot);
          } else if (platform === 'tiktok') {
            await tiktokService.uploadVideo(video.filePath, metadata, videoId, userId, bot);
          }

          logger.info({ jobId: job.id, videoId, platform }, 'Загрузка на платформу успешна');
        } catch (err) {
          logger.error({ jobId: job.id, videoId, platform, err }, 'Ошибка загрузки на платформу');
          errors.push({ platform, error: err });
        }
      }

      // Если были ошибки — пробрасываем, чтобы BullMQ выполнил retry
      if (errors.length > 0) {
        const errorMessages = errors
          .map((e) => `${e.platform}: ${(e.error as Error).message}`)
          .join('; ');
        throw new Error(`Ошибки загрузки: ${errorMessages}`);
      }

      // Все платформы успешны — удаляем видеофайл с диска
      try {
        await unlink(video.filePath);
        logger.info({ videoId, filePath: video.filePath }, 'Видеофайл удалён с диска');
      } catch (err) {
        // Не прерываем — файл мог быть уже удалён
        logger.error({ err, filePath: video.filePath }, 'Не удалось удалить видеофайл');
      }

      logger.info({ jobId: job.id, videoId, platforms }, 'Задача загрузки успешно завершена');
    },
    {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: url.password || undefined,
      },
    }
  );

  // Уведомляем Admin при исчерпании всех попыток
  worker.on('failed', async (job, err) => {
    if (!job) return;

    const { videoId, platforms } = job.data;
    const attemptsLeft = (job.opts.attempts ?? 3) - (job.attemptsMade ?? 0);

    logger.error(
      { jobId: job.id, videoId, platforms, attemptsMade: job.attemptsMade, err },
      'Задача загрузки завершилась ошибкой'
    );

    // Уведомляем Admin только после исчерпания всех попыток
    if (attemptsLeft <= 0 && adminId) {
      try {
        await bot.telegram.sendMessage(
          Number(adminId),
          `❌ Не удалось загрузить видео (ID: ${videoId}) после ${job.attemptsMade} попыток.\nОшибка: ${err.message}`
        );
      } catch (notifyErr) {
        logger.error({ notifyErr }, 'Не удалось отправить уведомление Admin об ошибке');
      }
    }
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Ошибка воркера загрузки');
  });

  logger.info('UploadWorker запущен');
  return worker;
}
