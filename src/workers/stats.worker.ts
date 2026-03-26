import { Worker, type Job } from 'bullmq';
import pino from 'pino';
import { youtubeService } from '../services/youtube.service.js';
import { instagramService } from '../services/instagram.service.js';
import { tiktokService } from '../services/tiktok.service.js';
import { postRepository } from '../db/repositories/post.repository.js';
import { videoRepository } from '../db/repositories/video.repository.js';
import type { StatsJobData } from '../queue/stats.queue.js';

const logger = pino({ name: 'stats-worker' });

/**
 * Создаёт и запускает StatsWorker — обработчик задач из очереди fetchStats.
 * При ошибке логирует и продолжает обработку остальных задач.
 * Requirements: 9.3, 9.4, 9.5, 9.6, 9.7, 12.3
 */
export function createStatsWorker(redisUrl: string): Worker<StatsJobData> {
  const url = new URL(redisUrl);
  const isTls = url.protocol === 'rediss:';

  const worker = new Worker<StatsJobData>(
    'fetchStats',
    async (job: Job<StatsJobData>) => {
      const { postId } = job.data;

      logger.info({ jobId: job.id, postId }, 'Начало сбора статистики');

      // Получаем запись Post из DB
      const post = await postRepository.findById(postId);
      if (!post) {
        logger.error({ postId }, 'Post не найден в DB, пропускаем задачу');
        return; // Не бросаем ошибку — продолжаем обработку остальных задач
      }

      // Получаем userId через связанное видео
      const video = await videoRepository.findById(post.videoId);
      if (!video) {
        logger.error({ postId, videoId: post.videoId }, 'Video не найдено в DB, пропускаем задачу');
        return;
      }

      const userId = video.userId;

      try {
        let stats;

        if (post.platform === 'youtube') {
          stats = await youtubeService.getStats(post.postId, userId);
        } else if (post.platform === 'instagram') {
          stats = await instagramService.getStats(post.postId, userId);
        } else if (post.platform === 'tiktok') {
          stats = await tiktokService.getStats(post.postId, userId);
        } else {
          logger.error({ postId, platform: post.platform }, 'Неизвестная платформа, пропускаем');
          return;
        }

        // Обновляем views, likes, comments_count, last_checked_at в DB
        await postRepository.updateStats(postId, stats);

        logger.info({ jobId: job.id, postId, platform: post.platform, stats }, 'Статистика успешно обновлена');
      } catch (err: any) {
        // Если видео удалено на платформе (404) — удаляем Post из DB
        const status = err?.response?.status ?? err?.status;
        if (status === 404) {
          logger.info({ postId, platform: post.platform }, 'Видео удалено на платформе, удаляем Post из DB');
          await postRepository.deleteById(postId);
          return;
        }
        // Логируем ошибку и продолжаем — не пробрасываем исключение
        // Requirements: 9.7, 12.3
        logger.error({ jobId: job.id, postId, platform: post.platform, err }, 'Ошибка сбора статистики, продолжаем');
      }
    },
    {
      connection: {
        host: url.hostname,
        port: Number(url.port) || 6379,
        password: url.password ? decodeURIComponent(url.password) : undefined,
        tls: isTls ? {} : undefined,
      },
    }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Задача сбора статистики завершилась ошибкой');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Ошибка воркера статистики');
  });

  logger.info('StatsWorker запущен');
  return worker;
}
