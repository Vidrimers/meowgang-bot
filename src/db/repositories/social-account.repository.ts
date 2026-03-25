import { eq, and } from 'drizzle-orm';
import { db } from '../index.js';
import { socialAccounts, type SocialAccount, type NewSocialAccount } from '../schema.js';
import type { Platform } from '../types.js';

export const socialAccountRepository = {
  // Найти аккаунт пользователя для конкретной платформы
  async findByUserAndPlatform(userId: string, platform: Platform): Promise<SocialAccount | undefined> {
    const result = await db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.platform, platform)))
      .limit(1);
    return result[0];
  },

  // Создать или обновить аккаунт (upsert по userId + platform)
  async upsert(data: NewSocialAccount): Promise<SocialAccount> {
    const existing = await this.findByUserAndPlatform(data.userId, data.platform as Platform);

    if (existing) {
      const result = await db
        .update(socialAccounts)
        .set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          platformUserId: data.platformUserId,
        })
        .where(eq(socialAccounts.id, existing.id))
        .returning();
      return result[0];
    }

    const result = await db.insert(socialAccounts).values(data).returning();
    return result[0];
  },

  // Обновить токены после refresh
  async updateTokens(
    id: string,
    accessToken: string,
    refreshToken: string,
    expiresAt: Date
  ): Promise<SocialAccount> {
    const result = await db
      .update(socialAccounts)
      .set({ accessToken, refreshToken, expiresAt })
      .where(eq(socialAccounts.id, id))
      .returning();
    return result[0];
  },

  // Удалить аккаунт
  async deleteById(id: string): Promise<void> {
    await db.delete(socialAccounts).where(eq(socialAccounts.id, id));
  },
};
