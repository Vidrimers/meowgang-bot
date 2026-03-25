// Feature: video-upload-bot, Property 7: Истёкший токен автоматически обновляется
// Validates: Requirements 5.6

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { encrypt } from '../src/utils/encryption.js';
import type { Platform } from '../src/db/types.js';

// ─── Тестовые константы ───────────────────────────────────────────────────────

const TEST_KEY = 'a'.repeat(64);

// ─── Моки ─────────────────────────────────────────────────────────────────────

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

// Хранилище для updateTokens — проверяем, что он был вызван
const updatedTokens: Array<{
  id: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> = [];

vi.mock('../src/db/repositories/social-account.repository.js', () => ({
  socialAccountRepository: {
    findByUserAndPlatform: vi.fn(),
    upsert: vi.fn(),
    updateTokens: vi.fn(async (id: string, accessToken: string, refreshToken: string, expiresAt: Date) => {
      updatedTokens.push({ id, accessToken, refreshToken, expiresAt });
      return { id, accessToken, refreshToken, expiresAt, platform: 'youtube', userId: 'u1', platformUserId: 'p1' };
    }),
  },
}));

vi.mock('../src/db/repositories/user.repository.js', () => ({
  userRepository: {
    findOrCreate: vi.fn(),
  },
}));

// ─── Тесты ────────────────────────────────────────────────────────────────────

describe('Property 7: Истёкший токен автоматически обновляется', () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
    process.env.YOUTUBE_CLIENT_ID = 'yt-client-id';
    process.env.YOUTUBE_CLIENT_SECRET = 'yt-client-secret';
    process.env.INSTAGRAM_CLIENT_ID = 'ig-client-id';
    process.env.INSTAGRAM_CLIENT_SECRET = 'ig-client-secret';
    process.env.TIKTOK_CLIENT_ID = 'tt-client-id';
    process.env.TIKTOK_CLIENT_SECRET = 'tt-client-secret';
    process.env.SERVER_IP = '127.0.0.1';
    process.env.PORT = '3000';
    updatedTokens.length = 0;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.TOKEN_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    }
    vi.clearAllMocks();
  });

  it('getValidToken вызывает refresh и возвращает новый токен при истёкшем expires_at', async () => {
    const { default: axios } = await import('axios');
    const { socialAccountRepository } = await import('../src/db/repositories/social-account.repository.js');
    const { oauthService } = await import('../src/services/oauth.service.js');

    const platformArb = fc.constantFrom<Platform>('youtube', 'instagram', 'tiktok');
    const tokenArb = fc.string({ minLength: 10, maxLength: 256 });
    // Дата в прошлом — токен истёк
    const expiredDateArb = fc.date({
      min: new Date('2020-01-01'),
      max: new Date(Date.now() - 120_000), // минимум 2 минуты назад
    });

    await fc.assert(
      fc.asyncProperty(
        platformArb,
        tokenArb,
        tokenArb,
        tokenArb,
        expiredDateArb,
        async (platform, oldAccessToken, oldRefreshToken, newAccessToken, expiresAt) => {
          updatedTokens.length = 0;

          // Мок: аккаунт с истёкшим токеном
          vi.mocked(socialAccountRepository.findByUserAndPlatform).mockResolvedValueOnce({
            id: 'account-id',
            userId: 'user-id',
            platform,
            accessToken: encrypt(oldAccessToken),
            refreshToken: encrypt(oldRefreshToken),
            expiresAt,
            platformUserId: 'platform-user-id',
          });

          // Мок: refresh возвращает новый токен
          vi.mocked(axios.post).mockResolvedValueOnce({
            data: {
              access_token: newAccessToken,
              refresh_token: oldRefreshToken,
              expires_in: 3600,
            },
          });

          const result = await oauthService.getValidToken(platform, 'user-id');

          // Возвращает новый access_token (не выбрасывает исключение)
          expect(result).toBe(newAccessToken);
          // updateTokens был вызван — токены обновлены в DB
          expect(updatedTokens).toHaveLength(1);
          expect(updatedTokens[0].id).toBe('account-id');
          // Новый expiresAt в будущем
          expect(updatedTokens[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
        }
      ),
      { numRuns: 100 }
    );
  });

  it('getValidToken возвращает текущий токен без refresh, если он ещё валиден', async () => {
    const { socialAccountRepository } = await import('../src/db/repositories/social-account.repository.js');
    const { oauthService } = await import('../src/services/oauth.service.js');

    const tokenArb = fc.string({ minLength: 10, maxLength: 256 });
    // Дата в будущем — токен валиден (минимум 5 минут запаса)
    const validDateArb = fc.date({
      min: new Date(Date.now() + 5 * 60_000),
      max: new Date(Date.now() + 7 * 24 * 60 * 60_000),
    });

    await fc.assert(
      fc.asyncProperty(tokenArb, validDateArb, async (accessToken, expiresAt) => {
        updatedTokens.length = 0;

        vi.mocked(socialAccountRepository.findByUserAndPlatform).mockResolvedValueOnce({
          id: 'account-id',
          userId: 'user-id',
          platform: 'youtube',
          accessToken: encrypt(accessToken),
          refreshToken: encrypt('some-refresh-token'),
          expiresAt,
          platformUserId: 'platform-user-id',
        });

        const result = await oauthService.getValidToken('youtube', 'user-id');

        // Возвращает текущий токен
        expect(result).toBe(accessToken);
        // updateTokens НЕ вызывался
        expect(updatedTokens).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it('getValidToken выбрасывает ошибку, если аккаунт не найден', async () => {
    const { socialAccountRepository } = await import('../src/db/repositories/social-account.repository.js');
    const { oauthService } = await import('../src/services/oauth.service.js');

    const platformArb = fc.constantFrom<Platform>('youtube', 'instagram', 'tiktok');

    await fc.assert(
      fc.asyncProperty(platformArb, async (platform) => {
        vi.mocked(socialAccountRepository.findByUserAndPlatform).mockResolvedValueOnce(undefined);

        await expect(oauthService.getValidToken(platform, 'user-id')).rejects.toThrow();
      }),
      { numRuns: 30 }
    );
  });
});
