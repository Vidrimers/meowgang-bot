import { Queue } from 'bullmq';

// Данные задачи сбора статистики
export interface StatsJobData {
  postId: string;
}

/**
 * Очередь сбора статистики публикаций.
 * Requirements: 9.1, 9.2
 */
export function createStatsQueue(redisUrl: string): Queue<StatsJobData> {
  const url = new URL(redisUrl);
  return new Queue<StatsJobData>('fetchStats', {
    connection: {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
    },
  });
}
