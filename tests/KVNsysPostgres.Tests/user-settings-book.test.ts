import { randomUUID } from 'node:crypto';
import { NoSettings } from '@kvnsys/core';
import { createPrismaClient, PrismaUserSettingsBook, type PrismaClient } from '@kvnsys/postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

describeWithDatabase("each person's settings in PostgreSQL", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let book: PrismaUserSettingsBook;
  let ana: string;
  let ben: string;

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    book = new PrismaUserSettingsBook(db);
    const role = await db.role.create({ data: { id: randomUUID(), code: 'CASHIER', name: 'Cashier' } });
    const person = async (username: string) =>
      (await db.user.create({ data: { id: randomUUID(), username, firstName: username, lastName: 'Cruz', passwordHash: 'not-checked-here', roleId: role.id } })).id;
    ana = await person('ana');
    ben = await person('ben');
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
    await database?.drop();
  });

  const rowOf = (userId: string) => db.userSetting.findUniqueOrThrow({ where: { userId } });

  it('reads none for someone who has changed nothing, without writing a row', async () => {
    expect(await book.read(ana)).toEqual(NoSettings);
    expect(await db.userSetting.count()).toBe(0);
  });

  it("keeps a person's settings in one row, replaced whole each time, and changes nobody else's", async () => {
    await book.keep(ana, { columnWidths: { Products: { Id: '8em' } } });
    await book.keep(ana, { columnWidths: { Machines: { Name: '20.5em' } } });
    expect(await book.read(ana)).toEqual({ columnWidths: { Machines: { Name: '20.5em' } } });
    expect(JSON.parse((await rowOf(ana)).settings)).toEqual({ columnWidths: { Machines: { Name: '20.5em' } } });
    expect(await book.read(ben)).toEqual(NoSettings);
    expect(await db.userSetting.count()).toBe(1);
  });

  it('notes when they were last changed', async () => {
    const before = (await rowOf(ana)).updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await book.keep(ana, { columnWidths: { Users: { Id: '9em' } } });
    expect((await rowOf(ana)).updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });

  it("reads damaged settings as none, and leaves out a width KVNsys can't use", async () => {
    await db.userSetting.create({ data: { userId: ben, settings: '{oops' } });
    expect(await book.read(ben)).toEqual(NoSettings);
    await db.userSetting.update({ where: { userId: ben }, data: { settings: JSON.stringify({ columnWidths: { Users: { Id: '9em', Name: '1em' } } }) } });
    expect(await book.read(ben)).toEqual({ columnWidths: { Users: { Id: '9em' } } });
  });
});
