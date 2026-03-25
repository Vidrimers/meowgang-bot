import type { Context, MiddlewareFn } from 'telegraf';

/**
 * Middleware авторизации: пропускает только Admin.
 * Сравнивает telegram_id отправителя с TELEGRAM_ADMIN_ID из env.
 */
export const adminOnly: MiddlewareFn<Context> = (ctx, next) => {
  const adminId = process.env.TELEGRAM_ADMIN_ID;
  const senderId = String(ctx.from?.id ?? '');

  if (!adminId || senderId !== adminId) {
    return ctx.reply('Доступ запрещён');
  }

  return next();
};

/**
 * Чистая функция проверки авторизации — используется в тестах.
 * Возвращает true, если senderId совпадает с adminId.
 */
export function isAuthorized(senderId: number | string, adminId: string): boolean {
  return String(senderId) === adminId;
}
