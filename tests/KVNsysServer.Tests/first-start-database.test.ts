import { applyDatabaseUpdates, createPrismaClient, PrismaSetupStore, PrismaUserDirectory } from '@kvnsys/postgres';
import { InstallSeed, ScryptPasswordHasher, setUpFirstShop, SignIn, type Questions } from '@kvnsys/server';
import { expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

describeWithDatabase('a first start on an empty database, against a real database', () => {
  it('sets the database up, asks once, and the chosen password then signs in', async () => {
    const database = await createThrowawayDatabase({ migrate: false });
    const db = createPrismaClient(database.url);
    try {
      await applyDatabaseUpdates(database.url);
      const hasher = new ScryptPasswordHasher();
      const seed = new InstallSeed(new PrismaSetupStore(db), hasher);
      expect(await seed.firstAdministratorNeeded()).toBe(true);

      const answers = ['Kenly Lucena', 'a-good-password', 'a-good-password'];
      const next = async () => answers.shift()!;
      const questions: Questions = { ask: next, askSecret: next };
      await setUpFirstShop(seed, questions, { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' }, () => {});

      // Asked once: from now on there's someone who can sign in.
      expect(await seed.firstAdministratorNeeded()).toBe(false);
      expect(await db.location.findMany({ select: { code: true, name: true } })).toEqual([{ code: 'HQ', name: 'Kenly Lucena' }]);
      expect(await new SignIn(new PrismaUserDirectory(db), hasher).run('admin', 'a-good-password')).toMatchObject({
        ok: true,
        user: { username: 'admin', roleCode: 'ADMIN' },
      });
    } finally {
      await db.$disconnect();
      await database.drop();
    }
  }, 120_000);
});
