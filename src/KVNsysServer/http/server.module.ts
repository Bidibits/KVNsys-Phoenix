import { Module } from '@nestjs/common';
import { HelloController } from './hello.controller.js';

/** Everything the server answers. Each new area adds its controllers here. */
@Module({ controllers: [HelloController] })
export class ServerModule {}
