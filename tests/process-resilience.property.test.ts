// Feature: video-upload-bot, Property 12: Процесс не падает при ошибках задач

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { registerGlobalErrorHandlers } from '../src/bot/index.js';

describe('Property 12: Процесс не падает при ошибках задач', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let originalUncaughtException: NodeJS.UncaughtExceptionListener[];
  let originalUnhandledRejection: NodeJS.UnhandledRejectionListener[];

  beforeEach(() => {
    // Сохраняем и очищаем существующие обработчики, чтобы не было дублей
    originalUncaughtException = process.listeners('uncaughtException') as NodeJS.UncaughtExceptionListener[];
    originalUnhandledRejection = process.listeners('unhandledRejection') as NodeJS.UnhandledRejectionListener[];
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    // Мокируем process.exit — он не должен вызываться
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: string | number | null | undefined) => {
      return undefined as never;
    });

    registerGlobalErrorHandlers();
  });

  afterEach(() => {
    exitSpy.mockRestore();
    // Восстанавливаем оригинальные обработчики
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    for (const listener of originalUncaughtException) {
      process.on('uncaughtException', listener);
    }
    for (const listener of originalUnhandledRejection) {
      process.on('unhandledRejection', listener);
    }
  });

  it('process.exit не вызывается при любом uncaughtException', () => {
    fc.assert(
      fc.property(
        // Генерируем произвольные ошибки с разными сообщениями
        fc.string({ minLength: 0, maxLength: 200 }),
        (message) => {
          exitSpy.mockClear();
          const err = new Error(message);

          // Эмулируем uncaughtException
          process.emit('uncaughtException', err, 'uncaughtException');

          expect(exitSpy).not.toHaveBeenCalled();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('process.exit не вызывается при любом unhandledRejection', () => {
    fc.assert(
      fc.property(
        // Генерируем произвольные значения rejection (строки, числа, объекты, null)
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.constant(null),
          fc.constant(undefined),
          fc.record({ code: fc.integer(), message: fc.string() })
        ),
        (reason) => {
          exitSpy.mockClear();

          // Эмулируем unhandledRejection
          process.emit('unhandledRejection', reason, Promise.resolve());

          expect(exitSpy).not.toHaveBeenCalled();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('обработчики зарегистрированы после вызова registerGlobalErrorHandlers', () => {
    expect(process.listenerCount('uncaughtException')).toBeGreaterThan(0);
    expect(process.listenerCount('unhandledRejection')).toBeGreaterThan(0);
  });
});
