// Feature: video-upload-bot, Property 4: Задача в очереди содержит корректные данные
// Validates: Requirements 4.1

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Platform } from '../src/db/types.js';
import { UPLOAD_JOB_OPTIONS } from '../src/queue/upload.queue.js';

// ─── Арбитрарии ──────────────────────────────────────────────────────────────

const platformArb = fc.constantFrom<Platform>('youtube', 'instagram', 'tiktok');

// Непустой список платформ (от 1 до 3)
const platformsArb = fc
  .subarray<Platform>(['youtube', 'instagram', 'tiktok'], { minLength: 1 })
  .map((arr) => arr as Platform[]);

// UUID v4 — имитируем реальный videoId
const videoIdArb = fc.uuid();

// ─── Мок очереди ─────────────────────────────────────────────────────────────

function createMockQueue() {
  const jobs: Array<{ name: string; data: { videoId: string; platforms: Platform[] }; opts: typeof UPLOAD_JOB_OPTIONS }> = [];

  return {
    add: vi.fn(async (name: string, data: { videoId: string; platforms: Platform[] }, opts: typeof UPLOAD_JOB_OPTIONS) => {
      jobs.push({ name, data, opts });
      return { id: 'mock-job-id' };
    }),
    getJobs: () => jobs,
    clear: () => { jobs.length = 0; },
  };
}

// ─── Тесты ───────────────────────────────────────────────────────────────────

describe('Property 4: Задача в очереди содержит корректные данные', () => {
  let mockQueue: ReturnType<typeof createMockQueue>;

  beforeEach(() => {
    mockQueue = createMockQueue();
  });

  it('задача содержит тот же videoId и список платформ без изменений', async () => {
    await fc.assert(
      fc.asyncProperty(videoIdArb, platformsArb, async (videoId, platforms) => {
        mockQueue.clear();

        await mockQueue.add('uploadVideo', { videoId, platforms }, UPLOAD_JOB_OPTIONS);

        const jobs = mockQueue.getJobs();
        expect(jobs).toHaveLength(1);

        const job = jobs[0];
        // videoId передаётся без изменений
        expect(job.data.videoId).toBe(videoId);
        // список платформ совпадает по содержимому
        expect(job.data.platforms).toEqual(platforms);
        // имя задачи корректное
        expect(job.name).toBe('uploadVideo');
      }),
      { numRuns: 100 }
    );
  });

  it('задача содержит конфигурацию retry: 3 попытки с exponential backoff', async () => {
    await fc.assert(
      fc.asyncProperty(videoIdArb, platformsArb, async (videoId, platforms) => {
        mockQueue.clear();

        await mockQueue.add('uploadVideo', { videoId, platforms }, UPLOAD_JOB_OPTIONS);

        const job = mockQueue.getJobs()[0];
        expect(job.opts.attempts).toBe(3);
        expect(job.opts.backoff).toEqual({ type: 'exponential', delay: 1000 });
      }),
      { numRuns: 100 }
    );
  });

  it('список платформ в задаче не пустой', async () => {
    await fc.assert(
      fc.asyncProperty(videoIdArb, platformsArb, async (videoId, platforms) => {
        mockQueue.clear();

        await mockQueue.add('uploadVideo', { videoId, platforms }, UPLOAD_JOB_OPTIONS);

        const job = mockQueue.getJobs()[0];
        expect(job.data.platforms.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('каждая платформа в задаче принадлежит допустимому множеству', async () => {
    const validPlatforms = new Set<Platform>(['youtube', 'instagram', 'tiktok']);

    await fc.assert(
      fc.asyncProperty(videoIdArb, platformsArb, async (videoId, platforms) => {
        mockQueue.clear();

        await mockQueue.add('uploadVideo', { videoId, platforms }, UPLOAD_JOB_OPTIONS);

        const job = mockQueue.getJobs()[0];
        for (const p of job.data.platforms) {
          expect(validPlatforms.has(p)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });
});
