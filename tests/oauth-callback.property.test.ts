// Feature: video-upload-bot, Property 5: OAuth callback сохраняет все поля токена
// Validates: Requirements 5.4

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { Platform } from '../src/db/types.js';

// ─── Тестовые константы ───────────────────────────────────────────────────────

const TEST_KEY = 'a'.repeat(64);
const ADMIN_TELEGRAM_ID = 123456789;

// ─── Моки ─────────────────────────────────────────────────────────────────────

// Мок axios — возвращает токены из параметров теста
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

// Мок репозитория — перехватываем upsert и запоминаем сохранённые данные
const savedAccounts: Array<{
  userId: string;
  platform: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  platformUserId: string;
}> = [];

vi.mock('../src/db/repositories/social-account.repository.js', () => ({
  socialAccountRepository: {
    findByUserAndPlatform: vi.fn().mockResolvedValue(undefined),
    upsert: vi.fn(async (data: typeof savedAccounts[0]) => {
      savedAccounts.push({ ...data });
      return { id: 'mock-id', ...data };
    }),
    updateTokens: vi.fn(),
  },
}));

vi.mock('../src/db/repositories/user.repository.js', () => ({
  userRepository: {
    findOrCreate: vi.fn().mockResolvedValue({ id: 'mock-user-id', telegramId: ADMIN_TELEGRAM_ID }),
  },
}));

// ─── Тесты ────────────────────────────────────────────────────────────────────

describe('Property 5: OAuth callback сохраняет все поля токена', () => {
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
    savedAccounts.length = 0;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.TOKEN_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    }
    vi.clearAllMocks();
  });

  it('после handleCallback в DB сохраняются непустые access_token, refresh_token, expires_at, platform_user_id', async () => {
    const { default: axios } = await import('axios');
    const { oauthService } = await import('../src/services/oauth.service.js');

    const platformArb = fc.constantFrom<Platform>('youtube', 'instagram', 'tiktok');

    // Генераторы токенов — непустые строки, имитирующие реальные OAuth-токены
    const tokenArb = fc.string({ minLength: 10, maxLength: 256 });
    const userIdArb = fc.string({ minLength: 5, maxLength: 64 });
    const expiresInArb = fc.integer({ min: 300, max: 7200 });

    await fc.assert(
      fc.asyncProperty(
        platformArb,
        tokenArb,
        tokenArb,
        expiresInArb,
        userIdArb,
        async (platform, accessToken, refreshToken, expiresIn, platformUserId) => {
          savedAccounts.length = 0;

          // Настраиваем мок axios для возврата токенов
          vi.mocked(axios.post).mockResolvedValueOnce({
            data: {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_in: expiresIn,
              // TikTok использует open_id, Instagram — user_id
              ...(platform === 'tiktok' ? { open_id: platformUserId } : { user_id: platformUserId }),
            },
          });

          await oauthService.handleCallback(platform, 'test-code', ADMIN_TELEGRAM_ID);

          // Проверяем, что upsert был вызван с непустыми полями
          expect(savedAccounts).toHaveLength(1);
          const saved = savedAccounts[0];

          // access_token и refresh_token сохранены (зашифрованы — не пустые строки)
          expect(saved.accessToken).toBeTruthy();
          expect(saved.refreshToken).toBeTruthy();
          // expires_at — валидная дата в будущем
          expect(saved.expiresAt).toBeInstanceOf(Date);
          expect(saved.expiresAt.getTime()).toBeGreaterThan(Date.now());
          // platform_user_id сохранён
          expect(saved.platformUserId).toBeTruthy();
          // platform совпадает
          expect(saved.platform).toBe(platform);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('access_token в DB зашифрован (не совпадает с исходным)', async () => {
    const { default: axios } = await import('axios');
    const { oauthService } = await import('../src/services/oauth.service.js');

    const tokenArb = fc.string({ minLength: 10, maxLength: 256 });

    await fc.assert(
      fc.asyncProperty(tokenArb, tokenArb, async (accessToken, refreshToken) => {
        savedAccounts.length = 0;

        vi.mocked(axios.post).mockResolvedValueOnce({
          data: {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 3600,
            user_id: 'test-user',
          },
        });

        await oauthService.handleCallback('youtube', 'test-code', ADMIN_TELEGRAM_ID);

        const saved = savedAccounts[0];
        // Зашифрованный токен не совпадает с исходным
        expect(saved.accessToken).not.toBe(accessToken);
        expect(saved.refreshToken).not.toBe(refreshToken);
      }),
      { numRuns: 100 }
    );
  });
});
