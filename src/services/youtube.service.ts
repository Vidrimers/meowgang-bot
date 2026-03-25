import { google } from 'googleapis';
import { createReadStream } from 'fs';
import pino from 'pino';
import type { Telegraf } from 'telegraf';
import { oauthService } from './oauth.service.js';
import { postRepository } from '../db/repositories/post.repository.js';
import type { VideoMetadata, PlatformStats } from '../db/types.js';

const logger = pino({ name: 'youtube-service' });

export const youtubeService = {
  /**
   * Загружает видео на YouTube через Data API v3.
   * Создаёт запись Post в DB и уведомляет Admin.
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   *
   * @param videoPath  — путь к файлу на диске
   * @param metadata   — title, description, tags
   * @param videoId    — UUID видео из таблицы videos (для создания Post)
   * @param userId     — UUID пользователя (для получения токена)
   * @param bot        — экземпляр Telegraf (для уведомления Admin)
   * @returns YouTube videoId
   */
  async uploadVideo(
    videoPath: string,
    metadata: VideoMetadata,
    videoId: string,
    userId: string,
    bot: Telegraf
  ): Promise<string> {
    logger.info({ videoPath, title: metadata.title }, 'Начало загрузки видео на YouTube');

    let accessToken: string;
    try {
      accessToken = await oauthService.getValidToken('youtube', userId);
    } catch (err) {
      logger.error({ err }, 'Не удалось получить токен YouTube');
      throw err;
    }

    // Настраиваем OAuth2-клиент с полученным токеном
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const youtube = google.youtube({ version: 'v3', auth });

    let youtubeVideoId: string;
    try {
      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags,
          },
          status: {
            privacyStatus: 'public',
          },
        },
        media: {
          body: createReadStream(videoPath),
        },
      });

      youtubeVideoId = response.data.id!;
      logger.info({ youtubeVideoId, videoPath }, 'Видео успешно загружено на YouTube');
    } catch (err) {
      logger.error({ err, videoPath }, 'Ошибка загрузки видео на YouTube');
      throw err;
    }

    // Создаём запись Post в DB
    try {
      await postRepository.create({
        videoId,
        platform: 'youtube',
        postId: youtubeVideoId,
      });
      logger.info({ youtubeVideoId, videoId }, 'Запись Post создана в DB');
    } catch (err) {
      logger.error({ err, youtubeVideoId }, 'Ошибка создания записи Post в DB');
      throw err;
    }

    // Уведомляем Admin
    const adminId = process.env.TELEGRAM_ADMIN_ID;
    if (adminId) {
      try {
        await bot.telegram.sendMessage(
          Number(adminId),
          `✅ Видео опубликовано на YouTube: https://youtube.com/watch?v=${youtubeVideoId}`
        );
      } catch (err) {
        // Не прерываем выполнение — уведомление некритично
        logger.error({ err, youtubeVideoId }, 'Не удалось отправить уведомление Admin');
      }
    }

    return youtubeVideoId;
  },

  /**
   * Получает статистику видео по YouTube videoId (postId).
   * Requirements: 9.3
   *
   * @param postId  — YouTube videoId (хранится в posts.post_id)
   * @param userId  — UUID пользователя (для получения токена)
   */
  async getStats(postId: string, userId: string): Promise<PlatformStats> {
    logger.info({ postId }, 'Запрос статистики YouTube');

    let accessToken: string;
    try {
      accessToken = await oauthService.getValidToken('youtube', userId);
    } catch (err) {
      logger.error({ err, postId }, 'Не удалось получить токен YouTube для статистики');
      throw err;
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const youtube = google.youtube({ version: 'v3', auth });

    try {
      const response = await youtube.videos.list({
        part: ['statistics'],
        id: [postId],
      });

      const item = response.data.items?.[0];
      if (!item?.statistics) {
        throw new Error(`Статистика для видео ${postId} не найдена`);
      }

      const stats: PlatformStats = {
        views: Number(item.statistics.viewCount ?? 0),
        likes: Number(item.statistics.likeCount ?? 0),
        commentsCount: Number(item.statistics.commentCount ?? 0),
      };

      logger.info({ postId, stats }, 'Статистика YouTube получена');
      return stats;
    } catch (err) {
      logger.error({ err, postId }, 'Ошибка получения статистики YouTube');
      throw err;
    }
  },
};
