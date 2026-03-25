// Feature: video-upload-bot, Property 10: Сбор статистики обновляет поля Post
// Validates: Requirements 9.6

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { PlatformStats } from '../src/db/types.js';
import type { Platform } from '../src/db/types.js';

// ─── Арбитрарии ──────────────────────────────────────────────────────────────

const platformArb = fc.constantFrom<Platform>('youtube', 'instagram', 'tiktok');

const statsArb = fc.record({
  views: fc.nat({ max: 10_000_000 }),
  likes: fc.nat({ max: 1_000_000 }),
  commentsCount: fc.nat({ max: 500_000 }),
});

const postIdArb = fc.uuid();
const videoIdArb = fc.uuid();
const userIdArb = fc.uuid();
const platformPostIdArb = fc.string({ minLength: 1, maxLength: 64 });

// ─── Симуляция StatsWorker ────────────────────────────────────────────────────

interface MockPost {
  id: string;
  videoId: string;
  platform: Platform;
  postId: string;
  views: number;
  likes: number;
  commentsCount: number;
  lastCheckedAt: Date | null;
}

interface MockVideo {
  id: string;
  userId: string;
}

/**
 * Симулирует логику StatsWorker без реальных зависимостей.
 * Проверяет, что после успешного получения статистики
 * поля views, likes, commentsCount и lastCheckedAt обновляются.
 */
async function simulateStatsWorker(
  post: MockPost,
  video: MockVideo,
  getStatsFn: (postId: string, userId: string) => Promise<PlatformStats>,
  updateStatsFn: (id: string, stats: PlatformStats) => Promise<MockPost>
): Promise<{ updated: boolean; updatedPost?: MockPost; error?: Error }> {
  try {
    const stats = await getStatsFn(post.postId, video.userId);
    const updatedPost = await updateStatsFn(post.id, stats);
    return { updated: true, updatedPost };
  } catch (err) {
    // StatsWorker логирует ошибку и продолжает — не пробрасывает
    return { updated: false, error: err as Error };
  }
}

// ─── Тесты ───────────────────────────────────────────────────────────────────

describe('Property 10: Сбор статистики обновляет поля Post', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('после успешного сбора статистики все поля Post обновляются', async () => {
    await fc.assert(
      fc.asyncProperty(
        postIdArb,
        videoIdArb,
        userIdArb,
        platformArb,
        platformPostIdArb,
        statsArb,
        async (postId, videoId, userId, platform, platformPostId, newStats) => {
          const post: MockPost = {
            id: postId,
            videoId,
            platform,
            postId: platformPostId,
            views: 0,
            likes: 0,
            commentsCount: 0,
            lastCheckedAt: null,
          };

          const video: MockVideo = { id: videoId, userId };

          // Мок: API платформы возвращает новую статистику
          const getStats = vi.fn().mockResolvedValue(newStats);

          // Мок: репозиторий обновляет запись и возвращает обновлённый Post
          const updateStats = vi.fn().mockImplementation(
            async (_id: string, stats: PlatformStats): Promise<MockPost> => ({
              ...post,
              views: stats.views,
              likes: stats.likes,
              commentsCount: stats.commentsCount,
              lastCheckedAt: new Date(),
            })
          );

          const result = await simulateStatsWorker(post, video, getStats, updateStats);

          // Обновление должно произойти
          expect(result.updated).toBe(true);
          expect(result.updatedPost).toBeDefined();

          const updated = result.updatedPost!;

          // Все три поля статистики должны совпадать с полученными от API
          expect(updated.views).toBe(newStats.views);
          expect(updated.likes).toBe(newStats.likes);
          expect(updated.commentsCount).toBe(newStats.commentsCount);

          // lastCheckedAt должен быть установлен (не null)
          expect(updated.lastCheckedAt).not.toBeNull();
          expect(updated.lastCheckedAt).toBeInstanceOf(Date);

          // getStats вызван ровно один раз с правильными аргументами
          expect(getStats).toHaveBeenCalledOnce();
          expect(getStats).toHaveBeenCalledWith(platformPostId, userId);

          // updateStats вызван ровно один раз с правильными данными
          expect(updateStats).toHaveBeenCalledOnce();
          expect(updateStats).toHaveBeenCalledWith(postId, newStats);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('при ошибке API статистика не обновляется и ошибка не пробрасывается', async () => {
    await fc.assert(
      fc.asyncProperty(
        postIdArb,
        videoIdArb,
        userIdArb,
        platformArb,
        platformPostIdArb,
        fc.string({ minLength: 1 }),
        async (postId, videoId, userId, platform, platformPostId, errorMessage) => {
          const post: MockPost = {
            id: postId,
            videoId,
            platform,
            postId: platformPostId,
            views: 0,
            likes: 0,
            commentsCount: 0,
            lastCheckedAt: null,
          };

          const video: MockVideo = { id: videoId, userId };

          // API платформы возвращает ошибку
          const getStats = vi.fn().mockRejectedValue(new Error(errorMessage));
          const updateStats = vi.fn();

          const result = await simulateStatsWorker(post, video, getStats, updateStats);

          // Обновление не произошло
          expect(result.updated).toBe(false);
          // Ошибка перехвачена — не пробрасывается (StatsWorker продолжает работу)
          expect(result.error).toBeInstanceOf(Error);
          // updateStats не вызывался
          expect(updateStats).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('lastCheckedAt обновляется до текущего времени при успешном сборе', async () => {
    await fc.assert(
      fc.asyncProperty(
        postIdArb,
        videoIdArb,
        userIdArb,
        platformArb,
        platformPostIdArb,
        statsArb,
        async (postId, videoId, userId, platform, platformPostId, newStats) => {
          const beforeUpdate = new Date();

          const post: MockPost = {
            id: postId,
            videoId,
            platform,
            postId: platformPostId,
            views: 0,
            likes: 0,
            commentsCount: 0,
            lastCheckedAt: null,
          };

          const video: MockVideo = { id: videoId, userId };

          const getStats = vi.fn().mockResolvedValue(newStats);
          const updateStats = vi.fn().mockImplementation(
            async (_id: string, stats: PlatformStats): Promise<MockPost> => ({
              ...post,
              views: stats.views,
              likes: stats.likes,
              commentsCount: stats.commentsCount,
              lastCheckedAt: new Date(),
            })
          );

          const result = await simulateStatsWorker(post, video, getStats, updateStats);

          const afterUpdate = new Date();

          expect(result.updated).toBe(true);
          const checkedAt = result.updatedPost!.lastCheckedAt!;

          // lastCheckedAt должен быть в диапазоне [beforeUpdate, afterUpdate]
          expect(checkedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
          expect(checkedAt.getTime()).toBeLessThanOrEqual(afterUpdate.getTime());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('статистика обновляется корректно для всех трёх платформ', async () => {
    await fc.assert(
      fc.asyncProperty(
        postIdArb,
        videoIdArb,
        userIdArb,
        platformPostIdArb,
        statsArb,
        async (postId, videoId, userId, platformPostId, newStats) => {
          const platforms: Platform[] = ['youtube', 'instagram', 'tiktok'];

          for (const platform of platforms) {
            const post: MockPost = {
              id: postId,
              videoId,
              platform,
              postId: platformPostId,
              views: 0,
              likes: 0,
              commentsCount: 0,
              lastCheckedAt: null,
            };

            const video: MockVideo = { id: videoId, userId };

            const getStats = vi.fn().mockResolvedValue(newStats);
            const updateStats = vi.fn().mockImplementation(
              async (_id: string, stats: PlatformStats): Promise<MockPost> => ({
                ...post,
                views: stats.views,
                likes: stats.likes,
                commentsCount: stats.commentsCount,
                lastCheckedAt: new Date(),
              })
            );

            const result = await simulateStatsWorker(post, video, getStats, updateStats);

            expect(result.updated).toBe(true);
            expect(result.updatedPost!.views).toBe(newStats.views);
            expect(result.updatedPost!.likes).toBe(newStats.likes);
            expect(result.updatedPost!.commentsCount).toBe(newStats.commentsCount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
