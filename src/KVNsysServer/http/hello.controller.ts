import { Controller, Get, Inject } from '@nestjs/common';
import { ProtocolVersion, type ServerHello } from '@kvnsys/wire';
import { ServerPassword } from '../security/server-password.js';
import { ServerVersion } from '../version.js';

@Controller('hello')
export class HelloController {
  constructor(@Inject(ServerPassword) private readonly serverPassword: ServerPassword) {}

  /**
   * Open to anyone on the network: it says what this is, and whether a register needs the server
   * password, and nothing about the shop's data.
   */
  @Get()
  hello(): ServerHello {
    return { product: 'KVNsys Server', version: ServerVersion, protocol: ProtocolVersion, serverPassword: this.serverPassword.state() !== 'off' };
  }
}
