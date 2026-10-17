import { Inject, Injectable } from '@nestjs/common';
import { newId } from '../../shared/domain/ids.js';
import { Refusal } from '../../shared/domain/refusal.js';
import type { Session } from '../../identity/domain/session.js';
import { assertCanRegisterAt, isInService, type LocationRef, type MachineRecord } from '../domain/machine.js';
import { DeviceTokens, LocationStore, MachineStore } from './ports.js';

export interface RegisterInput {
  locationId: string;
  code: string;
  name: string;
}

/**
 * Device registration: a browser can't see which computer it runs on, so a manager tells
 * the system once, and the browser keeps a random token that says "I am register FRONT-1"
 * from then on. See docs/design.md §8.
 */
@Injectable()
export class DeviceRegistrationService {
  constructor(
    @Inject(DeviceTokens) private readonly tokens: DeviceTokens,
    @Inject(MachineStore) private readonly machines: MachineStore,
    @Inject(LocationStore) private readonly locations: LocationStore,
  ) {}

  /** The register this browser is, from its token, or null if it isn't one (or is out of service). */
  async currentDevice(token: string | undefined): Promise<MachineRecord | null> {
    if (!token) return null;
    const machine = await this.machines.findByDeviceTokenHash(this.tokens.hash(token));
    return isInService(machine) ? machine : null;
  }

  locationsForRegistration(): Promise<LocationRef[]> {
    return this.locations.listActive();
  }

  async register(
    session: Session,
    input: RegisterInput,
    existingToken: string | undefined,
  ): Promise<{ machine: MachineRecord; token: string }> {
    const already = await this.currentDevice(existingToken);
    if (already) {
      throw new Refusal('conflict', `This device is already registered as ${already.code} (${already.name}).`);
    }

    const location = await this.locations.find(input.locationId);
    assertCanRegisterAt(location);

    if (await this.machines.codeTaken(input.code)) {
      throw new Refusal('conflict', `The code ${input.code} is already used by another machine. Pick another.`);
    }

    const { token, hash } = this.tokens.mint();
    const id = newId();
    const machine = await this.machines.createRegister({
      id,
      code: input.code,
      name: input.name,
      locationId: location.id,
      deviceTokenHash: hash,
      // The register is created *on itself*: the machine that wrote this row is the new one.
      lineage: { userId: session.userId, machineId: id, locationId: location.id },
    });
    return { machine, token };
  }
}
