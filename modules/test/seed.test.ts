import { describe, expect, it } from 'vitest';
import type { Lineage } from '../src/shared/domain/lineage.js';
import {
  InstallSeedService,
  SetupStore,
  type SeedInput,
  type SetupTransaction,
} from '../src/setup/application/install-seed.service.js';
import { ScryptPasswordHasher } from '../src/identity/infrastructure/scrypt-password-hasher.js';

interface Row {
  table: string;
  id: string;
  code?: string;
  lineage?: Lineage;
  [key: string]: unknown;
}

/** An in-memory database for the seed, enough to check what it writes and that it is re-runnable. */
class MemorySetup extends SetupStore {
  rows: Row[] = [];
  accesses: { roleId: string; access: string }[] = [];

  transaction<T>(work: (tx: SetupTransaction) => Promise<T>): Promise<T> {
    const rows = this.rows;
    const accesses = this.accesses;
    const find = (table: string, code: string) => rows.find((r) => r.table === table && r.code === code) ?? null;
    const tx: SetupTransaction = {
      findLocationByCode: async (code) => find('locations', code),
      findServerMachine: async (hardwareId, code) =>
        (rows.find((r) => r.table === 'machines' && hardwareId && r.machineUuid === hardwareId) as { id: string; code: string }) ??
        (find('machines', code) as { id: string; code: string } | null),
      createLocation: async (row) => void rows.push({ table: 'locations', ...row }),
      createServerMachine: async (row) => void rows.push({ table: 'machines', ...row }),
      findRoleByCode: async (code) => {
        const role = find('roles', code);
        return role ? { id: role.id, accesses: accesses.filter((a) => a.roleId === role.id).map((a) => a.access) } : null;
      },
      createRole: async (row) => void rows.push({ table: 'roles', ...row }),
      addAccess: async (row) => void accesses.push(row),
      countUsers: async () => rows.filter((r) => r.table === 'users').length,
      createUser: async (row) => void rows.push({ table: 'users', ...row }),
    };
    return work(tx);
  }

  count(table: string) {
    return this.rows.filter((r) => r.table === table).length;
  }
}

const input: SeedInput = {
  locationCode: 'HQ',
  locationName: 'Head Office',
  adminUsername: 'admin',
  adminPassword: 'a-long-password',
  server: { hardwareId: 'hw-1234', computerName: 'BRANCH-PC' },
};

function setup() {
  const store = new MemorySetup();
  return { store, service: new InstallSeedService(store, new ScryptPasswordHasher()) };
}

describe('InstallSeedService', () => {
  it('creates the location, the server machine, three roles and the administrator', async () => {
    const { store, service } = setup();
    await service.seed(input);
    expect(store.count('locations')).toBe(1);
    expect(store.count('machines')).toBe(1);
    expect(store.count('roles')).toBe(3);
    expect(store.count('users')).toBe(1);
  });

  it('records this server under its computer name and hardware id', async () => {
    const { store, service } = setup();
    await service.seed(input);
    const machine = store.rows.find((r) => r.table === 'machines');
    expect(machine).toMatchObject({ code: 'HQ-SRV', machineName: 'BRANCH-PC', machineUuid: 'hw-1234' });
  });

  it('stamps seeded rows as written by nobody, on this server, at this location', async () => {
    const { store, service } = setup();
    await service.seed(input);
    const location = store.rows.find((r) => r.table === 'locations')!;
    const machine = store.rows.find((r) => r.table === 'machines')!;
    for (const row of store.rows) {
      expect(row.lineage).toEqual({ userId: null, machineId: machine.id, locationId: location.id });
    }
  });

  it('can run again without creating anything twice', async () => {
    const { store, service } = setup();
    await service.seed(input);
    const second = await service.seed({ ...input, adminPassword: undefined });
    expect(second.created).toEqual([]);
    expect(store.count('users')).toBe(1);
    expect(store.count('roles')).toBe(3);
  });

  it('refuses to seed an empty database without an administrator password', async () => {
    await expect(setup().service.seed({ ...input, adminPassword: undefined })).rejects.toThrow(/PHOENIX_ADMIN_PASSWORD/);
  });

  it('refuses a short administrator password', async () => {
    await expect(setup().service.seed({ ...input, adminPassword: 'short' })).rejects.toThrow(/at least 8/);
  });

  it('stores the administrator password hashed, never as typed', async () => {
    const { store, service } = setup();
    await service.seed(input);
    const admin = store.rows.find((r) => r.table === 'users')!;
    expect(admin.passwordHash).not.toContain(input.adminPassword);
    expect(admin.passwordHash).toMatch(/^scrypt\$/);
  });
});
