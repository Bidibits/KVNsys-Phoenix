import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import type { LocationOption } from '@phoenix/contracts';
import { Accesses } from '../../identity/domain/accesses.js';
import { RequiresAccess, SessionGuard } from '../../identity/http/session.guard.js';
import { DeviceRegistrationService } from '../application/device-registration.service.js';

@Controller('locations')
export class LocationsController {
  constructor(@Inject(DeviceRegistrationService) private readonly registration: DeviceRegistrationService) {}

  /** The open shops a device can be registered at. */
  @Get()
  @UseGuards(SessionGuard)
  @RequiresAccess(Accesses.MachinesRegister)
  async list(): Promise<LocationOption[]> {
    const locations = await this.registration.locationsForRegistration();
    return locations.map(({ id, code, name }) => ({ id, code, name }));
  }
}
