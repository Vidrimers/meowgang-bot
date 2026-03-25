import { eq } from 'drizzle-orm';
import { db } from '../index.js';
import { users, type User, type NewUser } from '../schema.js';

export const userRepository = {
  // Найти пользователя по telegram_id
  async findByTelegramId(telegramId: number): Promise<User | undefined> {
    const result = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, telegramId))
      .limit(1);
    return result[0];
  },

  // Создать нового пользователя
  async create(data: NewUser): Promise<User> {
    const result = await db.insert(users).values(data).returning();
    return result[0];
  },

  // Найти или создать пользователя по telegram_id
  async findOrCreate(telegramId: number): Promise<User> {
    const existing = await this.findByTelegramId(telegramId);
    if (existing) return existing;
    return this.create({ telegramId });
  },

  // Удалить пользователя (каскадно удалит все связанные записи)
  async deleteById(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  },
};
