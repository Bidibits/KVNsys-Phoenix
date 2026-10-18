import { DefaultRoles } from '@kvnsys/core';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

describeWithDatabase('the seed, against a real database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let seed: InstallSeed;

  const input = {
    locationCode: 'HQ',
    locationName: 'Head Office',
    adminUsername: 'admin',
    adminPassword: 'test-admin-password',
    server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
  };

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    seed = new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher());
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
    await database?.drop();
  });

  it('fills an empty database: one location, this PC, three roles with their rights, one admin', async () => {
    await seed.run(input);
    expect(await db.location.count()).toBe(1);
    expect(await db.machine.findMany({ select: { code: true, machineName: true, machineUuid: true } })).toEqual([
      { code: 'HQ-SRV', machineName: 'TEST-SERVER', machineUuid: 'test-hardware-id' },
    ]);
    // The rule, not today's count: each role holds exactly the rights KVNsysCore gives it.
    const roles = await db.role.findMany({ include: { accesses: true }, orderBy: { level: 'desc' } });
    expect(roles.map((r) => [r.code, r.accesses.map((a) => a.access).sort()])).toEqual(
      DefaultRoles.map((role) => [role.code, [...role.accesses].sort()]),
    );
    expect(roles.map((r) => r.code)).toEqual(['ADMIN', 'MANAGER', 'CASHIER']);
    const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' }, include: { role: true } });
    expect(admin.role.code).toBe('ADMIN');
    expect(admin.passwordHash).toMatch(/^scrypt\$/);
  });

  it('stamps what it wrote as by nobody, on this PC, at this location', async () => {
    const location = await db.location.findUniqueOrThrow({ where: { code: 'HQ' } });
    const machine = await db.machine.findUniqueOrThrow({ where: { code: 'HQ-SRV' } });
    const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
    for (const row of [location, machine, admin]) {
      expect([row.createdByUser, row.createdAtMachine, row.createdAtLocation]).toEqual([null, machine.id, location.id]);
    }
  });

  it('changes nothing when run again', async () => {
    const report = await seed.run({ ...input, adminPassword: undefined });
    expect(report.created).toEqual([]);
    expect([await db.location.count(), await db.machine.count(), await db.role.count(), await db.user.count()]).toEqual([1, 1, 3, 1]);
  });
});
