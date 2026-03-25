import axios from 'axios';
import { createReadStream, statSync } from 'fs';
import pino from 'pino';
import type { Telegraf } from 'telegraf';
import { oauthService } from './oauth.service.js';
import { postRepository } from '../db/repositories/post.repository.js';
import type { VideoMetadata, PlatformStats } from '../db/types.js';

const logger = pino({ name: 'tiktok-service' });

// Базовый URL TikTok Business API
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

export const tiktokService = {
  /**
   * Загружает видео в TikTok через Business API.
   * Шаг 1: инициализирует загрузку через /video/upload/
   * Шаг 2: публикует через /video/publish/
   * Создаёт запись Post в DB и уведомляет Admin.
   * Requirements: 8.1, 8.2, 8.3, 8.4
   *
   * @param videoPath  — путь к файлу на диске
   * @param metadata   — title, description, tags
   * @param videoId    — UUID видео из таблицы videos (для создания Post)
   * @param userId     — UUID пользователя (для получения токена)
   * @param bot        — экземпляр Telegraf (для уведомления Admin)
   * @returns TikTok video ID
   */
  async uploadVideo(
    videoPath: string,
    metadata: VideoMetadata,
    videoId: string,
    userId: string,
    bot: Telegraf
  ): Promise<string> {
    logger.info({ videoPath, title: metadata.title }, 'Начало загрузки видео в TikTok');

    let accessToken: string;
    try {
      accessToken = await oauthService.getValidToken('tiktok', userId);
    } catch (err) {
      logger.error({ err }, 'Не удалось получить токен TikTok');
      throw err;
    }

    // Шаг 1: инициализируем загрузку видеофайла через /video/upload/
    let uploadId: string;
    try {
      const fileSize = statSync(videoPath).size;

      const initResponse = await axios.post<{
        data: { upload_url: string; upload_id: string };
        error: { code: string; message: string };
      }>(
        `${TIKTOK_API_BASE}/video/upload/`,
        { source_info: { source: 'FILE_UPLOAD', video_size: fileSize } },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        }
      );

      if (initResponse.data.error?.code && initResponse.data.error.code !== 'ok') {
        throw new Error(`TikTok upload init error: ${initResponse.data.error.message}`);
      }

      const { upload_url, upload_id } = initResponse.data.data;
      uploadId = upload_id;

      // Загружаем видеофайл по полученному upload_url
      const videoStream = createReadStream(videoPath);
      await axios.put(upload_url, videoStream, {
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
          'Content-Length': fileSize,
        },
      });

      logger.info({ uploadId }, 'Видеофайл загружен в TikTok');
    } catch (err) {
      logger.error({ err, videoPath }, 'Ошибка загрузки видеофайла в TikTok');
      throw err;
    }

    // Шаг 2: публикуем видео через /video/publish/
    let tiktokVideoId: string;
    try {
      const publishResponse = await axios.post<{
        data: { publish_id: string; video_id: string };
        error: { code: string; message: string };
      }>(
        `${TIKTOK_API_BASE}/video/publish/`,
        {
          upload_id: uploadId,
          title: metadata.title,
          description: metadata.description,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        }
      );

      if (publishResponse.data.error?.code && publishResponse.data.error.code !== 'ok') {
        throw new Error(`TikTok publish error: ${publishResponse.data.error.message}`);
      }

      tiktokVideoId = publishResponse.data.data.video_id;
      logger.info({ tiktokVideoId, videoPath }, 'Видео успешно опубликовано в TikTok');
    } catch (err) {
      logger.error({ err, uploadId }, 'Ошибка публикации видео в TikTok');
      throw err;
    }

    // Создаём запись Post в DB
    try {
      await postRepository.create({
        videoId,
        platform: 'tiktok',
        postId: tiktokVideoId,
      });
      logger.info({ tiktokVideoId, videoId }, 'Запись Post создана в DB (TikTok)');
    } catch (err) {
      logger.error({ err, tiktokVideoId }, 'Ошибка создания записи Post в DB (TikTok)');
      throw err;
    }

    // Уведомляем Admin
    const adminId = process.env.TELEGRAM_ADMIN_ID;
    if (adminId) {
      try {
        await bot.telegram.sendMessage(
          Number(adminId),
          `✅ Видео опубликовано в TikTok (video ID: ${tiktokVideoId})`
        );
      } catch (err) {
        // Уведомление некритично — не прерываем выполнение
        logger.error({ err, tiktokVideoId }, 'Не удалось отправить уведомление Admin (TikTok)');
      }
    }

    return tiktokVideoId;
  },

  /**
   * Получает статистику видео через TikTok Business API /video/query/.
   * Requirements: 9.5
   *
   * @param postId  — TikTok video ID (хранится в posts.post_id)
   * @param userId  — UUID пользователя (для получения токена)
   */
  async getStats(postId: string, userId: string): Promise<PlatformStats> {
    logger.info({ postId }, 'Запрос статистики TikTok');

    let accessToken: string;
    try {
      accessToken = await oauthService.getValidToken('tiktok', userId);
    } catch (err) {
      logger.error({ err, postId }, 'Не удалось получить токен TikTok для статистики');
      throw err;
    }

    try {
      const response = await axios.post<{
        data: {
          videos: Array<{
            id: string;
            statistics: {
              play_count: number;
              like_count: number;
              comment_count: number;
            };
          }>;
        };
        error: { code: string; message: string };
      }>(
        `${TIKTOK_API_BASE}/video/query/`,
        { filters: { video_ids: [postId] } },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          params: {
            fields: 'id,statistics',
          },
        }
      );

      if (response.data.error?.code && response.data.error.code !== 'ok') {
        throw new Error(`TikTok stats error: ${response.data.error.message}`);
      }

      const video = response.data.data?.videos?.[0];
      if (!video?.statistics) {
        throw new Error(`Статистика для видео TikTok ${postId} не найдена`);
      }

      const stats: PlatformStats = {
        views: video.statistics.play_count ?? 0,
        likes: video.statistics.like_count ?? 0,
        commentsCount: video.statistics.comment_count ?? 0,
      };

      logger.info({ postId, stats }, 'Статистика TikTok получена');
      return stats;
    } catch (err) {
      logger.error({ err, postId }, 'Ошибка получения статистики TikTok');
      throw err;
    }
  },
};
