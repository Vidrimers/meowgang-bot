// Feature: video-upload-bot, Property 6: Токены хранятся в зашифрованном виде (round-trip)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { encrypt, decrypt } from '../src/utils/encryption.js';

// Тестовый ключ: 32 байта в hex (64 символа)
const TEST_KEY = 'a'.repeat(64);

describe('Property 6: Токены хранятся в зашифрованном виде (round-trip)', () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.TOKEN_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.TOKEN_ENCRYPTION_KEY;
    }
  });

  it('decrypt(encrypt(token)) === token для любой строки токена', () => {
    fc.assert(
      fc.property(
        // Генерируем произвольные строки, имитирующие OAuth-токены
        fc.string({ minLength: 1, maxLength: 512 }),
        (token) => {
          const ciphertext = encrypt(token);
          const decrypted = decrypt(ciphertext);
          return decrypted === token;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('зашифрованное значение не совпадает с исходным plaintext', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 512 }),
        (token) => {
          const ciphertext = encrypt(token);
          return ciphertext !== token;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('два вызова encrypt для одного токена дают разные ciphertext (случайный IV)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 512 }),
        (token) => {
          const first = encrypt(token);
          const second = encrypt(token);
          // Разные IV → разные ciphertext, но оба корректно дешифруются
          return first !== second && decrypt(first) === token && decrypt(second) === token;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('выбрасывает ошибку при попытке дешифровать повреждённые данные', () => {
    expect(() => decrypt('invalid:data')).toThrow();
    expect(() => decrypt('not-valid-at-all')).toThrow();
  });
});
