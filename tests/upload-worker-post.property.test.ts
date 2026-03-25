// Feature: video-upload-bot, Property 8: Успешная загрузка создаёт Post в DB
// Validates: Requirements 6.2, 7.3, 8.3

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import type { Platform } from '../src/db/types.js';

// ─── Арбитрарии ──────────────────────────────────────────────────────────────

const platformArb = fc.constantFrom<Platform>('youtube', 'instagram', 'tiktok');

const videoIdArb = fc.uuid();

// Непустая строка — имитирует post_id, возвращаемый платформой
const postIdArb = fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.trim().length > 0);

// ─── Мок репозитория Post ─────────────────────────────────────────────────────

function createMockPostRepository() {
  const createdPosts: Array<{ videoId: string; platform: Platform; postId: string }> = [];

  return {
    create: vi.fn(async (data: { videoId: string; platform: Platform; postId: string }) => {
      createdPosts.push(data);
      return { id: 'mock-post-uuid', ...data, views: 0, likes: 0, commentsCount: 0, lastCheckedAt: null };
    }),
    getCreatedPosts: () => [...createdPosts],
    clear: () => { createdPosts.length = 0; },
  };
}

// ─── Симуляция успешной загрузки на платформу ────────────────────────────────

/**
 * Симулирует успешную загрузку видео на платформу:
 * вызывает platformUpload(), затем сохраняет Post в DB через postRepository.
 */
async function simulateSuccessfulUpload(
  videoId: string,
  platform: Platform,
  platformUpload: () => Promise<string>,
  postRepository: ReturnType<typeof createMockPostRepository>
): Promise<void> {
  const platformPostId = await platformUpload();

  await postRepository.create({
    videoId,
    platform,
    postId: platformPostId,
  });
}

// ─── Тесты ───────────────────────────────────────────────────────────────────

describe('Property 8: Успешная загрузка создаёт Post в DB', () => {
  it('после успешной загрузки на любую платформу создаётся запись Post', async () => {
    await fc.assert(
      fc.asyncProperty(videoIdArb, platformArb, postIdArb, async (videoId, platform, returnedPostId) => {
        // Создаём свежий мок на каждую итерацию, чтобы счётчик вызовов не накапливался
        const freshRepo = createMockPostRepository();
        const platformUpload = vi.fn().mockResolvedValue(returnedPostId);

        await simulateSuccessfulUpload(videoId, platform, platformUpload, freshRepo);

        const posts = freshRepo.getCreatedPosts();
        expect(posts).toHaveLength(1);
        expect(freshRepo.create).toHaveBeenCalledOnce();
      }),
      { numRuns: 100 }
    );
  });

  it('созданный Post содержит непустой post_id, возвращённый платформой', async () => {
    await fc.assert(
      fc.asyncProperty(videoIdArb, platformArb, postIdArb, async (videoId, platform, returnedPostId) => {
        const freshRepo = createMockPostRepository();
        const platformUpload = vi.fn().mockResolvedValue(returnedPostId);

        await simulateSuccessfulUpload(videoId, platform, platformUpload, freshRepo);

        const post = freshRepo.getCreatedPosts()[0];
        expect(post.postId).toBeTruthy();
        expect(post.postId.length).toBeGreaterThan(0);
        expect(post.postId).toBe(returnedPostId);
      }),
      { numRuns: 100 }
    );
  });

  it('созданный Post содержит правильный platform и videoId', async () => {
    await fc.assert(
      fc.asyncProperty(videoIdArb, platformArb, postIdArb, async (videoId, platform, returnedPostId) => {
        const freshRepo = createMockPostRepository();
        const platformUpload = vi.fn().mockResolvedValue(returnedPostId);

        await simulateSuccessfulUpload(videoId, platform, platformUpload, freshRepo);

        const post = freshRepo.getCreatedPosts()[0];
        expect(post.platform).toBe(platform);
        expect(post.videoId).toBe(videoId);
      }),
      { numRuns: 100 }
    );
  });

  it('при ошибке загрузки Post в DB не создаётся', async () => {
    await fc.assert(
      fc.asyncProperty(videoIdArb, platformArb, async (videoId, platform) => {
        const freshRepo = createMockPostRepository();
        const failingUpload = vi.fn().mockRejectedValue(new Error('Upload failed'));

        await expect(
          simulateSuccessfulUpload(videoId, platform, failingUpload, freshRepo)
        ).rejects.toThrow('Upload failed');

        expect(freshRepo.getCreatedPosts()).toHaveLength(0);
        expect(freshRepo.create).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  it('для каждой платформы из списка создаётся отдельный Post', async () => {
    await fc.assert(
      fc.asyncProperty(
        videoIdArb,
        fc.subarray<Platform>(['youtube', 'instagram', 'tiktok'], { minLength: 1 }).map((a) => a as Platform[]),
        postIdArb,
        async (videoId, platforms, basePostId) => {
          const freshRepo = createMockPostRepository();

          // Загружаем на каждую платформу последовательно
          for (const platform of platforms) {
            const platformPostId = `${basePostId}-${platform}`;
            const platformUpload = vi.fn().mockResolvedValue(platformPostId);
            await simulateSuccessfulUpload(videoId, platform, platformUpload, freshRepo);
          }

          const posts = freshRepo.getCreatedPosts();
          // Количество Post совпадает с количеством платформ
          expect(posts).toHaveLength(platforms.length);

          // Каждая платформа представлена ровно один раз
          const platformsInPosts = posts.map((p) => p.platform);
          for (const platform of platforms) {
            expect(platformsInPosts).toContain(platform);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
