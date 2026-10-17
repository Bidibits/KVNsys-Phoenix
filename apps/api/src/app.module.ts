import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IdentityModule, LocationsModule, RefusalFilter, SharedModule } from '@phoenix/modules';

/** The composition root: which modules this server runs. It holds no rules of its own. */
@Module({
  imports: [SharedModule, IdentityModule, LocationsModule],
  providers: [{ provide: APP_FILTER, useClass: RefusalFilter }],
})
export class AppModule {}
