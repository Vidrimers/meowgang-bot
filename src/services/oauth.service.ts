import axios from 'axios';
import { encrypt, decrypt } from '../utils/encryption.js';
import { socialAccountRepository } from '../db/repositories/social-account.repository.js';
import { userRepository } from '../db/repositories/user.repository.js';
import type { Platform } from '../db/types.js';

// ─── Конфигурация платформ ────────────────────────────────────────────────────

interface PlatformConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
}

/**
 * Формирует OAuth callback URL из переменных окружения.
 * Если задан SERVER_URL — использует его напрямую.
 * Иначе формирует из SERVER_IP и PORT.
 * Requirements: 13.3
 */
export function buildCallbackUrl(platform: Platform, ip?: string, port?: string): string {
  const serverUrl = process.env.SERVER_URL;
  if (serverUrl) {
    return `${serverUrl}/auth/${platform}/callback`;
  }
  const resolvedIp = ip ?? process.env.SERVER_IP;
  const resolvedPort = port ?? process.env.PORT;
  return `http://${resolvedIp}:${resolvedPort}/auth/${platform}/callback`;
}

function getPlatformConfig(platform: Platform): PlatformConfig {
  switch (platform) {
    case 'youtube':
      return {
        clientId: process.env.YOUTUBE_CLIENT_ID!,
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET!,
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      };
    case 'instagram':
      return {
        clientId: process.env.INSTAGRAM_CLIENT_ID!,
        clientSecret: process.env.INSTAGRAM_CLIENT_SECRET!,
        authUrl: 'https://www.instagram.com/oauth/authorize',
        tokenUrl: 'https://api.instagram.com/oauth/access_token',
        scope: 'instagram_business_basic,instagram_business_content_publish',
      };
    case 'tiktok':
      return {
        clientId: process.env.TIKTOK_CLIENT_ID!,
        clientSecret: process.env.TIKTOK_CLIENT_SECRET!,
        authUrl: 'https://www.tiktok.com/v2/auth/authorize',
        tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
        scope: 'video.upload,video.publish',
      };
  }
}

// ─── Интерфейс токена ─────────────────────────────────────────────────────────

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  platformUserId: string;
}

// ─── OAuthService ─────────────────────────────────────────────────────────────

export const oauthService = {
  /**
   * Формирует URL для OAuth авторизации на платформе.
   * Requirements: 5.1, 5.2, 5.3
   */
  getAuthUrl(platform: Platform): string {
    const cfg = getPlatformConfig(platform);
    const redirectUri = encodeURIComponent(buildCallbackUrl(platform));
    const scope = encodeURIComponent(cfg.scope);

    if (platform === 'youtube') {
      return `${cfg.authUrl}?client_id=${cfg.clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
    }
    if (platform === 'tiktok') {
      return `${cfg.authUrl}?client_key=${cfg.clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
    }
    // instagram
    return `${cfg.authUrl}?client_id=${cfg.clientId}&redirect_uri=${redirectUri}&scope=${scope}&response_type=code`;
  },

  /**
   * Обрабатывает OAuth callback: обменивает code на токены и сохраняет в DB.
   * Токены шифруются перед записью.
   * Requirements: 5.4, 5.5
   */
  async handleCallback(
    platform: Platform,
    code: string,
    adminTelegramId: number
  ): Promise<void> {
    const cfg = getPlatformConfig(platform);
    const redirectUri = buildCallbackUrl(platform);

    // Обмен code на токены
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const response = await axios.post<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      open_id?: string;       // TikTok
      user_id?: string;       // Instagram
    }>(cfg.tokenUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    let { access_token, refresh_token, expires_in } = response.data;
    const { open_id, user_id } = response.data;

    // Instagram: обмениваем короткоживущий токен на долгоживущий (60 дней)
    if (platform === 'instagram') {
      const longLivedRes = await axios.get<{
        access_token: string;
        token_type: string;
        expires_in: number;
      }>('https://graph.instagram.com/access_token', {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: cfg.clientSecret,
          access_token,
        },
      });
      access_token = longLivedRes.data.access_token;
      expires_in = longLivedRes.data.expires_in;
    }

    const expiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000);
    const platformUserId = open_id ?? user_id ?? 'unknown';

    // Находим или создаём пользователя
    const user = await userRepository.findOrCreate(adminTelegramId);

    // Сохраняем токены в зашифрованном виде
    await socialAccountRepository.upsert({
      userId: user.id,
      platform,
      accessToken: encrypt(access_token),
      refreshToken: encrypt(refresh_token ?? ''),
      expiresAt,
      platformUserId,
    });
  },

  /**
   * Возвращает валидный access_token, при необходимости обновляя его.
   * Requirements: 5.6, 5.7
   */
  async getValidToken(platform: Platform, userId: string): Promise<string> {
    const account = await socialAccountRepository.findByUserAndPlatform(userId, platform);
    if (!account) {
      throw new Error(`Аккаунт ${platform} не подключён`);
    }

    const now = new Date();
    // Обновляем токен за 60 секунд до истечения
    if (account.expiresAt > new Date(now.getTime() + 60_000)) {
      return decrypt(account.accessToken);
    }

    // Токен истёк — выполняем refresh
    const cfg = getPlatformConfig(platform);
    const currentRefreshToken = decrypt(account.refreshToken);

    let newAccessToken: string;
    let newRefreshToken: string;
    let newExpiresAt: Date;

    if (platform === 'instagram') {
      // Instagram: обновляем долгоживущий токен через graph.instagram.com
      const response = await axios.get<{
        access_token: string;
        expires_in: number;
      }>('https://graph.instagram.com/refresh_access_token', {
        params: {
          grant_type: 'ig_refresh_token',
          access_token: decrypt(account.accessToken),
        },
      });
      newAccessToken = response.data.access_token;
      newRefreshToken = newAccessToken; // Instagram не возвращает отдельный refresh_token
      newExpiresAt = new Date(Date.now() + response.data.expires_in * 1000);
    } else {
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        refresh_token: currentRefreshToken,
        grant_type: 'refresh_token',
      });

      const response = await axios.post<{
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      }>(cfg.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      newAccessToken = response.data.access_token;
      newRefreshToken = response.data.refresh_token ?? currentRefreshToken;
      newExpiresAt = new Date(Date.now() + (response.data.expires_in ?? 3600) * 1000);
    }

    await socialAccountRepository.updateTokens(
      account.id,
      encrypt(newAccessToken),
      encrypt(newRefreshToken),
      newExpiresAt
    );

    return newAccessToken;
  },
};
