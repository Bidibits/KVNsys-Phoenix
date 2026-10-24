import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaShopDirectory, type PrismaClient } from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

describeWithDatabase("the server's own shop, in PostgreSQL", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let shops: PrismaShopDirectory;
  let gumaca: { id: string; code: string; name: string };
  let hq: { id: string; code: string; name: string };

  const shop = async (code: string, name: string) => db.location.create({ data: { id: randomUUID(), code, name }, select: { id: true, code: true, name: true } });
  const machine = (code: string, locationId: string, machineUuid: string | null) =>
    db.machine.create({ data: { id: randomUUID(), code, name: code, machineUuid, locationId } });

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    shops = new PrismaShopDirectory(db);
    hq = await shop('HQ', 'Head Office');
    gumaca = await shop('GUMACA', 'Gumaca branch');
    await machine('HQ-SRV', hq.id, 'hq-hardware');
    await machine('GUMACA-SRV', gumaca.id, 'gumaca-hardware');
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it('is the shop its machine belongs to, found by hardware id even when the code names another', async () => {
    expect(await shops.serverShop({ hardwareId: 'gumaca-hardware', computerName: 'RENAMED' }, 'HQ-SRV')).toEqual(gumaca);
  });

  it('falls back to the machine code when the hardware id is unknown or unreadable', async () => {
    expect(await shops.serverShop({ hardwareId: 'a-new-motherboard', computerName: 'X' }, 'HQ-SRV')).toEqual(hq);
    expect(await shops.serverShop({ hardwareId: null, computerName: 'X' }, 'GUMACA-SRV')).toEqual(gumaca);
  });

  it('is none when this PC was never set up as a server', async () => {
    expect(await shops.serverShop({ hardwareId: 'stranger', computerName: 'X' }, 'NOWHERE-SRV')).toBeNull();
  });
});
