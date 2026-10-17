import { Inject, Injectable } from '@nestjs/common';
import { newId } from '../../shared/domain/ids.js';
import type { Lineage } from '../../shared/domain/lineage.js';
import { Refusal } from '../../shared/domain/refusal.js';
import { PasswordHasher } from '../../identity/application/ports.js';
import { AccessDescriptions, type AccessName } from '../../identity/domain/accesses.js';
import { AdminRoleCode, DefaultRoles } from '../../identity/domain/roles.js';
import { passwordProblem } from '../../identity/domain/session.js';
import { serverMachineCode } from '../../locations/domain/machine.js';

export interface SeedInput {
  locationCode: string;
  locationName: string;
  adminUsername: string;
  /** Needed only on the first run, when there are no users yet. */
  adminPassword: string | undefined;
  /** The PC this server runs on. The one machine that can identify itself. */
  server: { hardwareId: string | null; computerName: string };
}

export interface SeedReport {
  created: string[];
  unchanged: string[];
}

/** One database transaction's worth of setup reads and writes. */
export interface SetupTransaction {
  findLocationByCode(code: string): Promise<{ id: string } | null>;
  findServerMachine(hardwareId: string | null, code: string): Promise<{ id: string; code: string } | null>;
  createLocation(row: { id: string; code: string; name: string; lineage: Lineage }): Promise<void>;
  createServerMachine(row: {
    id: string;
    code: string;
    name: string;
    machineUuid: string | null;
    machineName: string;
    locationId: string;
    lineage: Lineage;
  }): Promise<void>;
  findRoleByCode(code: string): Promise<{ id: string; accesses: string[] } | null>;
  createRole(row: { id: string; code: string; name: string; level: number; lineage: Lineage }): Promise<void>;
  addAccess(row: { id: string; roleId: string; access: string; description: string }): Promise<void>;
  countUsers(): Promise<number>;
  createUser(row: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
    roleId: string;
    lineage: Lineage;
  }): Promise<void>;
}

export abstract class SetupStore {
  abstract transaction<T>(work: (tx: SetupTransaction) => Promise<T>): Promise<T>;
}

/**
 * Prepares a fresh database so a person can sign in: the location this server serves, the
 * server PC as its first machine, the default roles, and the first administrator.
 *
 * Safe to run again: it creates only what is missing and reports what it left alone. It
 * never creates a second administrator once any user exists.
 */
@Injectable()
export class InstallSeedService {
  constructor(
    @Inject(SetupStore) private readonly store: SetupStore,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
  ) {}

  async seed(input: SeedInput): Promise<SeedReport> {
    const adminHash = input.adminPassword ? await this.hashAdminPassword(input.adminPassword) : undefined;

    return this.store.transaction(async (tx) => {
      const report: SeedReport = { created: [], unchanged: [] };
      const machineCode = serverMachineCode(input.locationCode);

      const location = await tx.findLocationByCode(input.locationCode);
      const server = await tx.findServerMachine(input.server.hardwareId, machineCode);
      const locationId = location?.id ?? newId();
      const machineId = server?.id ?? newId();

      // Seeded rows are written by nobody (no one is signed in), on this server, at this location.
      const lineage: Lineage = { userId: null, machineId, locationId };

      if (location) {
        report.unchanged.push(`Location ${input.locationCode} already exists.`);
      } else {
        await tx.createLocation({ id: locationId, code: input.locationCode, name: input.locationName, lineage });
        report.created.push(`Location ${input.locationCode} (${input.locationName}).`);
      }

      if (server) {
        report.unchanged.push(`This server is already recorded as machine ${server.code}.`);
      } else {
        await tx.createServerMachine({
          id: machineId,
          code: machineCode,
          name: 'Server',
          machineUuid: input.server.hardwareId,
          machineName: input.server.computerName,
          locationId,
          lineage,
        });
        report.created.push(`Machine ${machineCode}: this server (${input.server.computerName}).`);
      }

      const roleIds = new Map<string, string>();
      for (const role of DefaultRoles) {
        const existing = await tx.findRoleByCode(role.code);
        const roleId = existing?.id ?? newId();
        roleIds.set(role.code, roleId);
        if (!existing) {
          await tx.createRole({ id: roleId, code: role.code, name: role.name, level: role.level, lineage });
          report.created.push(`Role ${role.code} (${role.name}).`);
        }
        const missing = role.accesses.filter((access) => !existing?.accesses.includes(access));
        for (const access of missing) {
          await tx.addAccess({ id: newId(), roleId, access, description: AccessDescriptions[access as AccessName] });
        }
        if (existing && missing.length > 0) report.created.push(`Role ${role.code}: added ${missing.join(', ')}.`);
        if (existing && missing.length === 0) report.unchanged.push(`Role ${role.code} is up to date.`);
      }

      if ((await tx.countUsers()) > 0) {
        report.unchanged.push('Users already exist, so no administrator was created.');
      } else {
        if (!adminHash) {
          throw new Refusal(
            'invalid',
            'This database has no users yet. Set PHOENIX_ADMIN_PASSWORD so the first administrator can be created.',
          );
        }
        await tx.createUser({
          id: newId(),
          username: input.adminUsername,
          firstName: 'System',
          lastName: 'Administrator',
          passwordHash: adminHash,
          roleId: roleIds.get(AdminRoleCode)!,
          lineage,
        });
        report.created.push(`Administrator "${input.adminUsername}".`);
      }

      return report;
    });
  }

  private async hashAdminPassword(password: string): Promise<string> {
    const problem = passwordProblem(password);
    if (problem) throw new Refusal('invalid', `PHOENIX_ADMIN_PASSWORD: ${problem}`);
    return this.hasher.hash(password);
  }
}
