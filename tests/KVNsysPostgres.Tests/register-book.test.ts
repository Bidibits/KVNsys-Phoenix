import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaRegisterBook, type PrismaClient } from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

describeWithDatabase('registers in PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let book: PrismaRegisterBook;
  let hq: string;
  let gumaca: string;
  let serverId: string;
  const someone = { userId: randomUUID(), machineId: null, locationId: null };
  const pc = (id: string, computerName = id.toUpperCase()) => ({ hardwareId: id, computerName });

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    book = new PrismaRegisterBook(db);
    hq = (await db.location.create({ data: { id: randomUUID(), code: 'HQ', name: 'Head Office' } })).id;
    gumaca = (await db.location.create({ data: { id: randomUUID(), code: 'GUMACA', name: 'Gumaca' } })).id;
    serverId = (await db.machine.create({ data: { id: randomUUID(), code: 'HQ-SRV', name: 'Server', machineUuid: 'server-pc', locationId: hq } })).id;
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it("records a PC the first time it's seen, with the shop's next code, and knows it again after", async () => {
    const first = await book.recognise(pc('pc-1', 'COUNTER-PC'), hq, someone);
    expect(first).toMatchObject({ code: 'HQ-R01', name: 'New register (COUNTER-PC)', computerName: 'COUNTER-PC', status: 'Active', isServer: false, locationId: hq });
    expect((await book.recognise(pc('pc-2'), hq, someone)).code).toBe('HQ-R02');
    expect((await book.recognise(pc('pc-3'), gumaca, someone)).code).toBe('GUMACA-R01');
    expect(await book.recognise(pc('pc-1', 'COUNTER-PC'), hq, someone)).toEqual(first);
    expect(await db.machine.count()).toBe(4);
  });

  it('keeps a renamed PC as the same register, with its new computer name', async () => {
    const before = await book.recognise(pc('pc-1', 'OLD-NAME'), hq, someone);
    await book.update(before.id, { name: 'Counter 1', status: 'Active' }, someone);
    expect(await book.recognise(pc('pc-1', 'NEW-NAME'), hq, someone)).toMatchObject({ id: before.id, name: 'Counter 1', computerName: 'NEW-NAME' });
  });

  it('gives PCs signing in for the first time together each their own code, and a PC signing in twice at once one register', async () => {
    const many = await Promise.all(['a', 'b', 'c', 'd', 'e'].map((id) => book.recognise(pc(id), hq, someone)));
    expect(many.map((r) => r.code).sort()).toEqual(['HQ-R01', 'HQ-R02', 'HQ-R03', 'HQ-R04', 'HQ-R05']);
    const same = await Promise.all(Array.from({ length: 5 }, () => book.recognise(pc('f'), hq, someone)));
    expect(new Set(same.map((r) => r.id)).size).toBe(1);
  });

  it("lists a shop's registers, the server PC first, and renames one or switches it off", async () => {
    const counter = await book.recognise(pc('pc-1'), hq, someone);
    await book.recognise(pc('pc-9'), gumaca, someone);
    expect((await book.list(hq)).map((r) => [r.code, r.isServer])).toEqual([
      ['HQ-SRV', true],
      ['HQ-R01', false],
    ]);
    expect(await book.update(counter.id, { name: 'Counter 1', status: 'Inactive' }, someone)).toMatchObject({ name: 'Counter 1', status: 'Inactive' });
    expect(await db.machine.findUniqueOrThrow({ where: { id: counter.id } })).toMatchObject({ updatedByUser: someone.userId });
  });

  it('renames the server PC, but never switches it off', async () => {
    expect(await book.update(serverId, { name: 'Back office PC', status: 'Active' }, someone)).toMatchObject({ name: 'Back office PC', isServer: true });
    await expect(book.update(serverId, { name: 'Back office PC', status: 'Inactive' }, someone)).rejects.toMatchObject({
      kind: 'invalid',
      message: /^The server PC stays switched on/,
    });
    await expect(book.update(randomUUID(), { name: 'X', status: 'Active' }, someone)).rejects.toMatchObject({ kind: 'not-found' });
    expect(await book.get('HQ-SRV')).toBeNull();
  });
});
