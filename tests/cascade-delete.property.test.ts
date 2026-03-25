// Feature: video-upload-bot, Property 11: Каскадное удаление сохраняет ссылочную целостность

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Вспомогательные типы для in-memory хранилища
// ---------------------------------------------------------------------------
interface UserRow    { id: string; telegramId: number }
interface AccountRow { id: string; userId: string; platform: string }
interface VideoRow   { id: string; userId: string; title: string }
interface PostRow    { id: string; videoId: string; platform: string }

// ---------------------------------------------------------------------------
// In-memory реализация каскадного удаления — имитирует поведение PostgreSQL
// с ON DELETE CASCADE, которое объявлено в src/db/schema.ts
// ---------------------------------------------------------------------------
function buildStore() {
  const users    = new Map<string, UserRow>();
  const accounts = new Map<string, AccountRow>();
  const videos   = new Map<string, VideoRow>();
  const posts    = new Map<string, PostRow>();

  return {
    users, accounts, videos, posts,

    // Удаление пользователя с каскадом: accounts, videos → posts
    deleteUser(userId: string) {
      // Удаляем social_accounts
      for (const [id, acc] of accounts) {
        if (acc.userId === userId) accounts.delete(id);
      }
      // Удаляем posts через videos
      for (const [vid, video] of videos) {
        if (video.userId === userId) {
          for (const [pid, post] of posts) {
            if (post.videoId === vid) posts.delete(pid);
          }
          videos.delete(vid);
        }
      }
      users.delete(userId);
    },
  };
}

// ---------------------------------------------------------------------------
// Генераторы fast-check
// ---------------------------------------------------------------------------
const uuidArb = fc.uuid();

const platformArb = fc.constantFrom('youtube', 'instagram', 'tiktok');

// Генерирует граф: 1 user + N accounts + M videos + K posts
const graphArb = fc.record({
  userId:       uuidArb,
  telegramId:   fc.integer({ min: 1, max: 2_147_483_647 }),
  accountCount: fc.integer({ min: 0, max: 3 }),
  videoCount:   fc.integer({ min: 0, max: 3 }),
  postPerVideo: fc.integer({ min: 0, max: 2 }),
});

// ---------------------------------------------------------------------------
// Тесты
// ---------------------------------------------------------------------------
describe('Property 11: Каскадное удаление сохраняет ссылочную целостность', () => {

  it(
    'после удаления User не остаётся осиротевших SocialAccount, Video и Post',
    () => {
      fc.assert(
        fc.property(graphArb, uuidArb.chain(() => uuidArb), ({ userId, telegramId, accountCount, videoCount, postPerVideo }) => {
          const store = buildStore();

          // Заполняем хранилище
          store.users.set(userId, { id: userId, telegramId });

          for (let a = 0; a < accountCount; a++) {
            const id = `acc-${userId}-${a}`;
            store.accounts.set(id, { id, userId, platform: 'youtube' });
          }

          const videoIds: string[] = [];
          for (let v = 0; v < videoCount; v++) {
            const id = `vid-${userId}-${v}`;
            store.videos.set(id, { id, userId, title: `video-${v}` });
            videoIds.push(id);
          }

          for (const videoId of videoIds) {
            for (let p = 0; p < postPerVideo; p++) {
              const id = `post-${videoId}-${p}`;
              store.posts.set(id, { id, videoId, platform: 'youtube' });
            }
          }

          // Удаляем пользователя
          store.deleteUser(userId);

          // Проверяем: пользователь удалён
          expect(store.users.has(userId)).toBe(false);

          // Нет осиротевших social_accounts
          for (const acc of store.accounts.values()) {
            expect(acc.userId).not.toBe(userId);
          }

          // Нет осиротевших videos
          for (const video of store.videos.values()) {
            expect(video.userId).not.toBe(userId);
          }

          // Нет осиротевших posts (videoId должен существовать)
          for (const post of store.posts.values()) {
            expect(store.videos.has(post.videoId)).toBe(true);
          }

          return true;
        }),
        { numRuns: 100 }
      );
    }
  );

  it(
    'удаление несуществующего User не затрагивает чужие записи',
    () => {
      fc.assert(
        fc.property(
          fc.uuid(), // userId для удаления
          fc.uuid(), // другой userId
          fc.integer({ min: 1, max: 999 }),
          (targetId, otherId, telegramId) => {
            fc.pre(targetId !== otherId);

            const store = buildStore();

            // Добавляем другого пользователя с данными
            store.users.set(otherId, { id: otherId, telegramId });
            store.accounts.set(`acc-${otherId}`, { id: `acc-${otherId}`, userId: otherId, platform: 'tiktok' });
            store.videos.set(`vid-${otherId}`, { id: `vid-${otherId}`, userId: otherId, title: 'other' });
            store.posts.set(`post-${otherId}`, { id: `post-${otherId}`, videoId: `vid-${otherId}`, platform: 'tiktok' });

            // Удаляем несуществующего пользователя
            store.deleteUser(targetId);

            // Данные другого пользователя не тронуты
            expect(store.users.has(otherId)).toBe(true);
            expect(store.accounts.has(`acc-${otherId}`)).toBe(true);
            expect(store.videos.has(`vid-${otherId}`)).toBe(true);
            expect(store.posts.has(`post-${otherId}`)).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
