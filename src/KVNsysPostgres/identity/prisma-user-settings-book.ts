import { readUserSettings, UserSettingsBook, type UserSettings } from '@kvnsys/core';
import type { PrismaClient } from '../generated/prisma/client.js';

/**
 * Each person's settings, as JSON text in user_settings: one row per person who has changed any.
 * Not audited: they're how one person likes the screens, not a record of the business's.
 */
export class PrismaUserSettingsBook extends UserSettingsBook {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async read(userId: string): Promise<UserSettings> {
    const row = await this.db.userSetting.findUnique({ where: { userId }, select: { settings: true } });
    return readUserSettings(row?.settings ?? null);
  }

  async keep(userId: string, settings: UserSettings): Promise<void> {
    const text = JSON.stringify(settings);
    await this.db.userSetting.upsert({
      where: { userId },
      create: { userId, settings: text },
      update: { settings: text, updatedAt: new Date() },
    });
  }
}
