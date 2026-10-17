import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module.js';
import { DeviceRegistrationService } from './application/device-registration.service.js';
import { DeviceTokens, LocationStore, MachineStore } from './application/ports.js';
import { DevicesController } from './http/devices.controller.js';
import { LocationsController } from './http/locations.controller.js';
import { PrismaLocationStore } from './infrastructure/prisma-location-store.js';
import { PrismaMachineStore } from './infrastructure/prisma-machine-store.js';
import { Sha256DeviceTokens } from './infrastructure/sha256-device-tokens.js';

@Module({
  imports: [IdentityModule],
  controllers: [DevicesController, LocationsController],
  providers: [
    DeviceRegistrationService,
    { provide: DeviceTokens, useClass: Sha256DeviceTokens },
    { provide: MachineStore, useClass: PrismaMachineStore },
    { provide: LocationStore, useClass: PrismaLocationStore },
  ],
})
export class LocationsModule {}
