import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaLocationDirectory, type PrismaClient } from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

describeWithDatabase("the server's own location, in PostgreSQL", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let locations: PrismaLocationDirectory;
  let gumaca: { id: string; code: string; name: string };
  let hq: { id: string; code: string; name: string };

  const location = async (code: string, name: string) => db.location.create({ data: { id: randomUUID(), code, name }, select: { id: true, code: true, name: true } });
  const machine = (code: string, locationId: string, machineUuid: string | null) =>
    db.machine.create({ data: { id: randomUUID(), code, name: code, machineUuid, locationId } });

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    locations = new PrismaLocationDirectory(db);
    hq = await location('HQ', 'Head Office');
    gumaca = await location('GUMACA', 'Gumaca branch');
    await machine('HQ-SRV', hq.id, 'hq-hardware');
    await machine('GUMACA-SRV', gumaca.id, 'gumaca-hardware');
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it('is the location its machine belongs to, found by hardware id even when the code names another', async () => {
    expect(await locations.serverLocation({ hardwareId: 'gumaca-hardware', computerName: 'RENAMED' }, 'HQ-SRV')).toEqual(gumaca);
  });

  it('falls back to the machine code when the hardware id is unknown or unreadable', async () => {
    expect(await locations.serverLocation({ hardwareId: 'a-new-motherboard', computerName: 'X' }, 'HQ-SRV')).toEqual(hq);
    expect(await locations.serverLocation({ hardwareId: null, computerName: 'X' }, 'GUMACA-SRV')).toEqual(gumaca);
  });

  it('is none when this PC was never set up as a server', async () => {
    expect(await locations.serverLocation({ hardwareId: 'stranger', computerName: 'X' }, 'NOWHERE-SRV')).toBeNull();
  });
});
