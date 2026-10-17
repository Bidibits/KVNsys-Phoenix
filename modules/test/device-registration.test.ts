import { describe, expect, it } from 'vitest';
import type { Session } from '../src/identity/domain/session.js';
import { DeviceRegistrationService } from '../src/locations/application/device-registration.service.js';
import { LocationStore, MachineStore, type NewRegister } from '../src/locations/application/ports.js';
import type { LocationRef, MachineRecord } from '../src/locations/domain/machine.js';
import { Sha256DeviceTokens } from '../src/locations/infrastructure/sha256-device-tokens.js';

const hq: LocationRef = { id: '0192f3c1-0000-7000-8000-0000000000a1', code: 'HQ', name: 'Head Office', status: 'Active' };
const closed: LocationRef = { id: '0192f3c1-0000-7000-8000-0000000000a2', code: 'OLD', name: 'Old shop', status: 'Closed' };

const manager: Session = {
  userId: '0192f3c1-0000-7000-8000-0000000000b1',
  username: 'ana',
  displayName: 'Ana Cruz',
  roleCode: 'MANAGER',
  accesses: ['machines.register'],
  expiresAt: Date.now() + 60_000,
};

/** An in-memory machines table, enough to test the rules without a database. */
class MemoryMachines extends MachineStore {
  rows: (NewRegister & { status: string })[] = [];

  async findByDeviceTokenHash(hash: string): Promise<MachineRecord | null> {
    const row = this.rows.find((r) => r.deviceTokenHash === hash);
    return row ? { id: row.id, code: row.code, name: row.name, status: row.status, location: hq } : null;
  }
  async codeTaken(code: string) {
    return this.rows.some((r) => r.code === code);
  }
  async createRegister(register: NewRegister): Promise<MachineRecord> {
    this.rows.push({ ...register, status: 'Active' });
    return { id: register.id, code: register.code, name: register.name, status: 'Active', location: hq };
  }
}

class MemoryLocations extends LocationStore {
  async find(id: string) {
    return [hq, closed].find((l) => l.id === id) ?? null;
  }
  async listActive() {
    return [hq];
  }
}

function setup() {
  const machines = new MemoryMachines();
  const tokens = new Sha256DeviceTokens();
  const service = new DeviceRegistrationService(tokens, machines, new MemoryLocations());
  return { machines, tokens, service };
}

describe('DeviceRegistrationService', () => {
  it('a browser with no token is not a register', async () => {
    expect(await setup().service.currentDevice(undefined)).toBeNull();
  });

  it('registers a device, and the token it hands out identifies that device afterwards', async () => {
    const { service } = setup();
    const { machine, token } = await service.register(manager, { locationId: hq.id, code: 'FRONT-1', name: 'Front counter 1' }, undefined);
    expect(machine.code).toBe('FRONT-1');
    expect((await service.currentDevice(token))?.id).toBe(machine.id);
  });

  it('stores only a hash of the token, never the token', async () => {
    const { service, machines } = setup();
    const { token } = await service.register(manager, { locationId: hq.id, code: 'FRONT-1', name: 'Front 1' }, undefined);
    expect(machines.rows[0]?.deviceTokenHash).not.toBe(token);
    expect(machines.rows[0]?.deviceTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stamps the row as written by the manager, on the new register itself, at its location', async () => {
    const { service, machines } = setup();
    const { machine } = await service.register(manager, { locationId: hq.id, code: 'FRONT-1', name: 'Front 1' }, undefined);
    expect(machines.rows[0]?.lineage).toEqual({ userId: manager.userId, machineId: machine.id, locationId: hq.id });
  });

  it('refuses to register a device that is already a register', async () => {
    const { service } = setup();
    const { token } = await service.register(manager, { locationId: hq.id, code: 'FRONT-1', name: 'Front 1' }, undefined);
    await expect(service.register(manager, { locationId: hq.id, code: 'FRONT-2', name: 'Front 2' }, token)).rejects.toThrow(
      /already registered as FRONT-1/,
    );
  });

  it('refuses a code another machine already uses', async () => {
    const { service } = setup();
    await service.register(manager, { locationId: hq.id, code: 'FRONT-1', name: 'Front 1' }, undefined);
    await expect(service.register(manager, { locationId: hq.id, code: 'FRONT-1', name: 'Another' }, undefined)).rejects.toThrow(
      /already used/,
    );
  });

  it('refuses a closed location and one that does not exist', async () => {
    const { service } = setup();
    await expect(service.register(manager, { locationId: closed.id, code: 'X-1', name: 'X' }, undefined)).rejects.toThrow(/closed/);
    await expect(
      service.register(manager, { locationId: '0192f3c1-0000-7000-8000-0000000000ff', code: 'X-1', name: 'X' }, undefined),
    ).rejects.toThrow(/doesn't exist/);
  });

  it('a decommissioned register no longer counts as this device', async () => {
    const { service, machines } = setup();
    const { token } = await service.register(manager, { locationId: hq.id, code: 'FRONT-1', name: 'Front 1' }, undefined);
    machines.rows[0]!.status = 'Decommissioned';
    expect(await service.currentDevice(token)).toBeNull();
  });
});
