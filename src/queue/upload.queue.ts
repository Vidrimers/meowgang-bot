import { Queue } from 'bullmq';
import type { JobsOptions } from 'bullmq';
import type { Platform } from '../db/types.js';

// Данные задачи загрузки видео
export interface UploadJobData {
  videoId: string;
  platforms: Platform[];
}

// Конфигурация retry: 3 попытки, exponential backoff 1s/2s/4s
export const UPLOAD_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000, // 1s → 2s → 4s
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

/**
 * Очередь загрузки видео на платформы.
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
export function createUploadQueue(redisUrl: string): Queue<UploadJobData> {
  const url = new URL(redisUrl);
  return new Queue<UploadJobData>('uploadVideo', {
    connection: {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
    },
  });
}
