import axios from 'axios';
import { createReadStream } from 'fs';
import pino from 'pino';
import type { Telegraf } from 'telegraf';
import { oauthService } from './oauth.service.js';
import { postRepository } from '../db/repositories/post.repository.js';
import type { PlatformStats } from '../db/types.js';

const logger = pino({ name: 'instagram-service' });

// Базовый URL Meta Graph API
const GRAPH_API_BASE = 'https://graph.instagram.com/v21.0';

export const instagramService = {
  /**
   * Загружает видео в Instagram Reels через Meta Graph API.
   * Шаг 1: создаёт медиа-контейнер через /media
   * Шаг 2: публикует через /media_publish
   * Создаёт запись Post в DB и уведомляет Admin.
   * Requirements: 7.1, 7.2, 7.3, 7.4
   *
   * @param videoPath  — путь к файлу на диске
   * @param caption    — подпись (title + description)
   * @param videoId    — UUID видео из таблицы videos (для создания Post)
   * @param userId     — UUID пользователя (для получения токена)
   * @param bot        — экземпляр Telegraf (для уведомления Admin)
   * @returns Instagram media ID
   */
  async uploadReel(
    videoPath: string,
    caption: string,
    videoId: string,
    userId: string,
    bot: Telegraf
  ): Promise<string> {
    logger.info({ videoPath, caption: caption.slice(0, 50) }, 'Начало загрузки Reel в Instagram');

    let accessToken: string;
    try {
      accessToken = await oauthService.getValidToken('instagram', userId);
    } catch (err) {
      logger.error({ err }, 'Не удалось получить токен Instagram');
      throw err;
    }

    // Получаем Instagram Business Account ID
    let igUserId: string;
    try {
      const meResponse = await axios.get<{ id: string }>(`${GRAPH_API_BASE}/me`, {
        params: { access_token: accessToken, fields: 'id' },
      });
      igUserId = meResponse.data.id;
    } catch (err) {
      logger.error({ err }, 'Не удалось получить Instagram user ID');
      throw err;
    }

    // Шаг 1: загружаем видеофайл и создаём медиа-контейнер
    let containerId: string;
    try {
      const formData = new FormData();
      formData.append('media_type', 'REELS');
      formData.append('caption', caption);
      formData.append('video_url', ''); // будет заменено на upload через form-data
      formData.append('access_token', accessToken);

      // Instagram требует публично доступный URL для видео.
      // Используем resumable upload через /media с video_url или прямую загрузку.
      // Для прямой загрузки используем upload session.
      const uploadSessionResponse = await axios.post<{ id: string; upload_url: string }>(
        `${GRAPH_API_BASE}/${igUserId}/media`,
        null,
        {
          params: {
            media_type: 'REELS',
            caption,
            access_token: accessToken,
            upload_type: 'resumable',
          },
        }
      );

      const uploadUrl = uploadSessionResponse.data.upload_url;
      containerId = uploadSessionResponse.data.id;

      // Загружаем видеофайл по upload_url
      const videoStream = createReadStream(videoPath);
      await axios.post(uploadUrl, videoStream, {
        headers: {
          Authorization: `OAuth ${accessToken}`,
          offset: '0',
          file_size: '0', // Instagram вычислит сам
          'Content-Type': 'application/octet-stream',
        },
      });

      logger.info({ containerId }, 'Медиа-контейнер Instagram создан, видео загружено');
    } catch (err) {
      logger.error({ err, videoPath }, 'Ошибка создания медиа-контейнера Instagram');
      throw err;
    }

    // Шаг 2: публикуем контейнер через /media_publish
    let mediaId: string;
    try {
      const publishResponse = await axios.post<{ id: string }>(
        `${GRAPH_API_BASE}/${igUserId}/media_publish`,
        null,
        {
          params: {
            creation_id: containerId,
            access_token: accessToken,
          },
        }
      );

      mediaId = publishResponse.data.id;
      logger.info({ mediaId, videoPath }, 'Reel успешно опубликован в Instagram');
    } catch (err) {
      logger.error({ err, containerId }, 'Ошибка публикации Reel в Instagram');
      throw err;
    }

    // Создаём запись Post в DB
    try {
      await postRepository.create({
        videoId,
        platform: 'instagram',
        postId: mediaId,
      });
      logger.info({ mediaId, videoId }, 'Запись Post создана в DB (Instagram)');
    } catch (err) {
      logger.error({ err, mediaId }, 'Ошибка создания записи Post в DB (Instagram)');
      throw err;
    }

    // Уведомляем Admin
    const adminId = process.env.TELEGRAM_ADMIN_ID;
    if (adminId) {
      try {
        await bot.telegram.sendMessage(
          Number(adminId),
          `✅ Reel опубликован в Instagram (media ID: ${mediaId})`
        );
      } catch (err) {
        // Уведомление некритично — не прерываем выполнение
        logger.error({ err, mediaId }, 'Не удалось отправить уведомление Admin (Instagram)');
      }
    }

    return mediaId;
  },

  /**
   * Получает статистику Reel через Meta Graph API /insights.
   * Requirements: 9.4
   *
   * @param postId  — Instagram media ID (хранится в posts.post_id)
   * @param userId  — UUID пользователя (для получения токена)
   */
  async getStats(postId: string, userId: string): Promise<PlatformStats> {
    logger.info({ postId }, 'Запрос статистики Instagram');

    let accessToken: string;
    try {
      accessToken = await oauthService.getValidToken('instagram', userId);
    } catch (err) {
      logger.error({ err, postId }, 'Не удалось получить токен Instagram для статистики');
      throw err;
    }

    try {
      const response = await axios.get<{
        data: Array<{ name: string; values: Array<{ value: number }> }>;
      }>(`${GRAPH_API_BASE}/${postId}/insights`, {
        params: {
          metric: 'plays,likes,comments',
          access_token: accessToken,
        },
      });

      const metrics = response.data.data;
      const getValue = (name: string): number => {
        const metric = metrics.find((m) => m.name === name);
        return metric?.values?.[0]?.value ?? 0;
      };

      const stats: PlatformStats = {
        views: getValue('plays'),
        likes: getValue('likes'),
        commentsCount: getValue('comments'),
      };

      logger.info({ postId, stats }, 'Статистика Instagram получена');
      return stats;
    } catch (err) {
      logger.error({ err, postId }, 'Ошибка получения статистики Instagram');
      throw err;
    }
  },
};
