import { pgTable, uuid, bigint, text, timestamp, integer } from 'drizzle-orm/pg-core';

// Таблица пользователей (Admin)
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Таблица OAuth-аккаунтов (токены зашифрованы AES-256-GCM)
export const socialAccounts = pgTable('social_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(), // 'youtube' | 'instagram' | 'tiktok'
  accessToken: text('access_token').notNull(),    // зашифрован
  refreshToken: text('refresh_token').notNull(),  // зашифрован
  expiresAt: timestamp('expires_at').notNull(),
  platformUserId: text('platform_user_id').notNull(),
});

// Таблица видеофайлов
export const videos = pgTable('videos', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  tags: text('tags').array().notNull().default([]),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Таблица публикаций на платформах
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  videoId: uuid('video_id')
    .notNull()
    .references(() => videos.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  postId: text('post_id').notNull(),
  views: integer('views').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  commentsCount: integer('comments_count').notNull().default(0),
  lastCheckedAt: timestamp('last_checked_at'),
});

// Типы строк таблиц (для репозиториев)
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type NewSocialAccount = typeof socialAccounts.$inferInsert;

export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
