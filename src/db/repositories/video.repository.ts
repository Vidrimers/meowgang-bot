import { eq, desc, inArray } from 'drizzle-orm';
import { db } from '../index.js';
import { videos, posts, type Video, type NewVideo } from '../schema.js';

export const videoRepository = {
  // Найти видео по ID
  async findById(id: string): Promise<Video | undefined> {
    const result = await db
      .select()
      .from(videos)
      .where(eq(videos.id, id))
      .limit(1);
    return result[0];
  },

  // Создать запись видео
  async create(data: NewVideo): Promise<Video> {
    const result = await db.insert(videos).values(data).returning();
    return result[0];
  },

  // Обновить метаданные видео (title, description, tags)
  async updateMetadata(
    id: string,
    metadata: { title: string; description: string; tags: string[] }
  ): Promise<Video> {
    const result = await db
      .update(videos)
      .set(metadata)
      .where(eq(videos.id, id))
      .returning();
    return result[0];
  },

  // Получить последние N видео пользователя
  async findRecentByUserId(userId: string, limit = 10): Promise<Video[]> {
    return db
      .select()
      .from(videos)
      .where(eq(videos.userId, userId))
      .orderBy(desc(videos.createdAt))
      .limit(limit);
  },

  // Удалить видео
  async deleteById(id: string): Promise<void> {
    await db.delete(videos).where(eq(videos.id, id));
  },

  // Получить последние N видео пользователя у которых есть хотя бы один Post
  async findRecentWithPostsByUserId(userId: string, limit = 10): Promise<Video[]> {
    // Получаем ID видео у которых есть посты
    const videoIdsWithPosts = await db
      .selectDistinct({ videoId: posts.videoId })
      .from(posts)
      .innerJoin(videos, eq(posts.videoId, videos.id))
      .where(eq(videos.userId, userId));

    if (videoIdsWithPosts.length === 0) return [];

    const ids = videoIdsWithPosts.map(r => r.videoId);
    return db
      .select()
      .from(videos)
      .where(inArray(videos.id, ids))
      .orderBy(desc(videos.createdAt))
      .limit(limit);
  },
};
