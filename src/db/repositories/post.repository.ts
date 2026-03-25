import { eq, desc, inArray } from 'drizzle-orm';
import { db } from '../index.js';
import { posts, videos, type Post, type NewPost } from '../schema.js';
import type { PlatformStats } from '../types.js';

export const postRepository = {
  // Найти публикацию по ID
  async findById(id: string): Promise<Post | undefined> {
    const result = await db
      .select()
      .from(posts)
      .where(eq(posts.id, id))
      .limit(1);
    return result[0];
  },

  // Найти все публикации для конкретного видео
  async findByVideoId(videoId: string): Promise<Post[]> {
    return db.select().from(posts).where(eq(posts.videoId, videoId));
  },

  // Создать запись публикации
  async create(data: NewPost): Promise<Post> {
    const result = await db.insert(posts).values(data).returning();
    return result[0];
  },

  // Обновить статистику публикации
  async updateStats(id: string, stats: PlatformStats): Promise<Post> {
    const result = await db
      .update(posts)
      .set({
        views: stats.views,
        likes: stats.likes,
        commentsCount: stats.commentsCount,
        lastCheckedAt: new Date(),
      })
      .where(eq(posts.id, id))
      .returning();
    return result[0];
  },

  // Получить последние 10 видео с публикациями для пользователя
  async findRecentWithPosts(userId: string): Promise<Post[]> {
    // Получаем последние 10 видео пользователя
    const recentVideos = await db
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.userId, userId))
      .orderBy(desc(videos.createdAt))
      .limit(10);

    if (recentVideos.length === 0) return [];

    const videoIds = recentVideos.map((v) => v.id);
    return db.select().from(posts).where(inArray(posts.videoId, videoIds));
  },

  // Получить все активные публикации (для StatsWorker)
  async findAllActive(): Promise<Post[]> {
    return db.select().from(posts);
  },

  // Удалить публикацию
  async deleteById(id: string): Promise<void> {
    await db.delete(posts).where(eq(posts.id, id));
  },
};
