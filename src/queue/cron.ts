import cron from 'node-cron';
import pino from 'pino';
import type { Queue } from 'bullmq';
import { postRepository } from '../db/repositories/post.repository.js';
import type { StatsJobData } from './stats.queue.js';

const logger = pino({ name: 'cron' });

/**
 * Запускает CronJob — каждые 6 часов добавляет задачи сбора статистики
 * для всех активных Post в StatsQueue.
 * Requirements: 9.1, 9.2
 */
export function startStatsCronJob(statsQueue: Queue<StatsJobData>): cron.ScheduledTask {
  // Каждые 6 часов: 0 */6 * * *
  const task = cron.schedule('0 */6 * * *', async () => {
    logger.info('CronJob: запуск сбора статистики для всех активных Post');

    try {
      const activePosts = await postRepository.findAllActive();

      if (activePosts.length === 0) {
        logger.info('CronJob: нет активных Post для сбора статистики');
        return;
      }

      // Добавляем задачу в StatsQueue для каждого Post
      const jobs = activePosts.map((post) =>
        statsQueue.add('fetchStats', { postId: post.id })
      );

      await Promise.all(jobs);

      logger.info({ count: activePosts.length }, 'CronJob: задачи добавлены в StatsQueue');
    } catch (err) {
      logger.error({ err }, 'CronJob: ошибка при добавлении задач в StatsQueue');
    }
  });

  logger.info('CronJob статистики запущен (каждые 6 часов)');
  return task;
}
