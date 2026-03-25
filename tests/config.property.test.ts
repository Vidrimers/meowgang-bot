// Feature: video-upload-bot, Property 13: Отсутствие любой обязательной переменной окружения завершает процесс

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { REQUIRED_ENV_VARS, validateConfig } from '../src/utils/config.js';

describe('Property 13: Отсутствие любой обязательной переменной окружения завершает процесс', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Сохраняем оригинальный process.env
    originalEnv = { ...process.env };

    // Мокируем process.exit, чтобы он не завершал тест-процесс
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null | undefined) => {
      return undefined as never;
    });
  });

  afterEach(() => {
    // Восстанавливаем оригинальный process.env
    process.env = originalEnv;
    exitSpy.mockRestore();
  });

  it(
    'вызывает process.exit(1) при отсутствии хотя бы одной обязательной переменной',
    () => {
      fc.assert(
        fc.property(
          // Генерируем непустое подмножество обязательных переменных для удаления
          fc.subarray(REQUIRED_ENV_VARS, { minLength: 1 }),
          (varsToRemove) => {
            // Устанавливаем все обязательные переменные
            for (const varName of REQUIRED_ENV_VARS) {
              process.env[varName] = 'test-value';
            }

            // Удаляем выбранное подмножество переменных
            for (const varName of varsToRemove) {
              delete process.env[varName];
            }

            exitSpy.mockClear();

            // Вызываем validateConfig — должна вызвать process.exit(1)
            validateConfig();

            // Проверяем, что process.exit был вызван с кодом 1
            expect(exitSpy).toHaveBeenCalledWith(1);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it('НЕ вызывает process.exit когда все переменные присутствуют', () => {
    // Устанавливаем все обязательные переменные
    for (const varName of REQUIRED_ENV_VARS) {
      process.env[varName] = 'test-value';
    }

    validateConfig();

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
