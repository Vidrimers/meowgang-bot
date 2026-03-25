// Feature: video-upload-bot, Property 2: Видеофайлы сверх лимита отклоняются
// Feature: video-upload-bot, Property 3: Только допустимые форматы принимаются

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isFileSizeAllowed,
  isAllowedExtension,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
} from '../src/bot/handlers/video.handler.js';

// ─── Property 2: Видеофайлы сверх лимита отклоняются ─────────────────────────
// Validates: Requirements 3.6

describe('Property 2: Видеофайлы сверх лимита отклоняются', () => {
  it('отклоняет любой файл, размер которого превышает MAX_FILE_SIZE_BYTES', () => {
    fc.assert(
      fc.property(
        // Генерируем размер строго больше лимита
        fc.integer({ min: MAX_FILE_SIZE_BYTES + 1, max: MAX_FILE_SIZE_BYTES + 10_000_000 }),
        (oversizedBytes) => {
          return isFileSizeAllowed(oversizedBytes) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('принимает любой файл, размер которого не превышает MAX_FILE_SIZE_BYTES', () => {
    fc.assert(
      fc.property(
        // Генерируем размер от 1 байта до лимита включительно
        fc.integer({ min: 1, max: MAX_FILE_SIZE_BYTES }),
        (validBytes) => {
          return isFileSizeAllowed(validBytes) === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('граничный случай: файл ровно на лимите принимается', () => {
    expect(isFileSizeAllowed(MAX_FILE_SIZE_BYTES)).toBe(true);
  });

  it('граничный случай: файл на 1 байт больше лимита отклоняется', () => {
    expect(isFileSizeAllowed(MAX_FILE_SIZE_BYTES + 1)).toBe(false);
  });

  it('нулевой размер принимается', () => {
    expect(isFileSizeAllowed(0)).toBe(true);
  });
});

// ─── Property 3: Только допустимые форматы принимаются ───────────────────────
// Validates: Requirements 3.7

describe('Property 3: Только допустимые форматы принимаются', () => {
  // Генератор произвольных расширений, не входящих в ALLOWED_EXTENSIONS
  const forbiddenExtArb = fc
    .string({ minLength: 1, maxLength: 5 })
    .filter((ext) => /^[a-z0-9]+$/.test(ext))
    .filter((ext) => !ALLOWED_EXTENSIONS.has(ext));

  it('отклоняет любое расширение, не входящее в допустимый список', () => {
    fc.assert(
      fc.property(forbiddenExtArb, (ext) => {
        return isAllowedExtension(`video.${ext}`) === false;
      }),
      { numRuns: 100 }
    );
  });

  it('принимает все допустимые расширения в нижнем регистре', () => {
    for (const ext of ALLOWED_EXTENSIONS) {
      expect(isAllowedExtension(`video.${ext}`)).toBe(true);
    }
  });

  it('принимает допустимые расширения в верхнем регистре', () => {
    for (const ext of ALLOWED_EXTENSIONS) {
      expect(isAllowedExtension(`video.${ext.toUpperCase()}`)).toBe(true);
    }
  });

  it('принимает допустимые расширения в смешанном регистре', () => {
    expect(isAllowedExtension('video.Mp4')).toBe(true);
    expect(isAllowedExtension('video.MOV')).toBe(true);
    expect(isAllowedExtension('video.Avi')).toBe(true);
  });

  it('отклоняет файл без расширения', () => {
    expect(isAllowedExtension('videofile')).toBe(false);
  });

  it('отклоняет популярные недопустимые форматы', () => {
    const forbidden = ['mkv', 'webm', 'flv', 'wmv', 'ts', 'jpg', 'png', 'pdf'];
    for (const ext of forbidden) {
      expect(isAllowedExtension(`file.${ext}`)).toBe(false);
    }
  });

  it('property: для любого допустимого расширения isAllowedExtension возвращает true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALLOWED_EXTENSIONS),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
        (ext, baseName) => {
          return isAllowedExtension(`${baseName}.${ext}`) === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
