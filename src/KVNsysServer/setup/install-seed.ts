import {
  AccessDescriptions,
  AdminRoleCode,
  DefaultRoles,
  newId,
  PasswordHasher,
  passwordProblem,
  Refusal,
  serverMachineCode,
  SetupStore,
  type Lineage,
  type PcIdentity,
} from '@kvnsys/core';

export interface SeedInput {
  locationCode: string;
  locationName: string;
  adminUsername: string;
  /** Needed only on the first run, when there are no users yet. */
  adminPassword: string | undefined;
  /** The PC this server runs on. */
  server: PcIdentity;
}

export interface SeedReport {
  created: string[];
  unchanged: string[];
}

/**
 * The one-time setup that makes a new install usable: the location this server serves,
 * this PC as its first machine, the default roles, and the first administrator.
 *
 * Safe to run again. It creates only what's missing, reports what it left alone, and never
 * creates a second administrator once any user exists. It all happens in one transaction,
 * so a failure halfway leaves nothing behind.
 */
export class InstallSeed {
  constructor(
    private readonly store: SetupStore,
    private readonly hasher: PasswordHasher,
  ) {}

  /** True on a brand-new install: there's nobody yet who could sign in. */
  async firstAdministratorNeeded(): Promise<boolean> {
    return (await this.store.transaction((tx) => tx.countUsers())) === 0;
  }

  async run(input: SeedInput): Promise<SeedReport> {
    // Hashing is slow on purpose, so it happens before the transaction opens.
    const adminHash = input.adminPassword === undefined ? undefined : await this.hashAdminPassword(input.adminPassword);

    return this.store.transaction(async (tx) => {
      const report: SeedReport = { created: [], unchanged: [] };
      const machineCode = serverMachineCode(input.locationCode);

      const location = await tx.findLocationByCode(input.locationCode);
      const server = await tx.findServerMachine(input.server.hardwareId, machineCode);
      const locationId = location?.id ?? newId();
      const machineId = server?.id ?? newId();

      // Seeded rows are written by nobody (no one is signed in), on this PC, at this location.
      const lineage: Lineage = { userId: null, machineId, locationId };

      if (location) {
        report.unchanged.push(`Location ${input.locationCode} already exists.`);
      } else {
        await tx.createLocation({ id: locationId, code: input.locationCode, name: input.locationName, lineage });
        report.created.push(`Location ${input.locationCode} (${input.locationName}).`);
      }

      if (server) {
        report.unchanged.push(`This PC is already recorded as machine ${server.code}.`);
      } else {
        await tx.createMachine({
          id: machineId,
          code: machineCode,
          name: 'Server',
          machineUuid: input.server.hardwareId,
          machineName: input.server.computerName,
          locationId,
          lineage,
        });
        report.created.push(`Machine ${machineCode}: this PC (${input.server.computerName}).`);
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
          await tx.addAccess({ id: newId(), roleId, access, description: AccessDescriptions[access], lineage });
        }
        if (existing && missing.length > 0) report.created.push(`Role ${role.code}: added ${missing.join(', ')}.`);
        if (existing && missing.length === 0) report.unchanged.push(`Role ${role.code} is up to date.`);
      }

      if ((await tx.countUsers()) > 0) {
        report.unchanged.push('Users already exist, so no administrator was created.');
        return report;
      }
      if (!adminHash) {
        throw new Refusal(
          'invalid',
          'This database has no users yet. Set KVNSYS_ADMIN_PASSWORD so the first administrator can be created.',
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
      return report;
    });
  }

  private async hashAdminPassword(password: string): Promise<string> {
    const problem = passwordProblem(password);
    if (problem) throw new Refusal('invalid', `KVNSYS_ADMIN_PASSWORD: ${problem}`);
    return this.hasher.hash(password);
  }
}
