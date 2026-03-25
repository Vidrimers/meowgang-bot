// Feature: video-upload-bot, Property 1: Авторизация блокирует посторонних

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isAuthorized } from '../src/bot/middleware/auth.middleware.js';

const ADMIN_ID = '123456789';

describe('Property 1: Авторизация блокирует посторонних', () => {
  it('блокирует любой telegram_id, не совпадающий с ADMIN_ID', () => {
    fc.assert(
      fc.property(
        // Генерируем произвольные числа, исключая ADMIN_ID
        fc.integer({ min: 1, max: 2_147_483_647 }).filter((id) => String(id) !== ADMIN_ID),
        (randomId) => {
          return isAuthorized(randomId, ADMIN_ID) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('пропускает только точное совпадение с ADMIN_ID', () => {
    fc.assert(
      fc.property(
        // Генерируем произвольные строки ADMIN_ID
        fc.integer({ min: 1, max: 2_147_483_647 }).map(String),
        (adminId) => {
          // Точное совпадение — авторизован
          expect(isAuthorized(adminId, adminId)).toBe(true);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('строковое и числовое представление одного ID считаются одинаковыми', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 2_147_483_647 }),
        (id) => {
          // isAuthorized должен приводить к строке
          return isAuthorized(id, String(id)) === isAuthorized(String(id), String(id));
        }
      ),
      { numRuns: 100 }
    );
  });
});
