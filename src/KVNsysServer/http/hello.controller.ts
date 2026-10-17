import { Controller, Get } from '@nestjs/common';
import { ProtocolVersion, type ServerHello } from '@kvnsys/wire';
import { ServerVersion } from '../version.js';

@Controller('hello')
export class HelloController {
  /** Open to anyone on the network: it says what this is, and nothing about the shop's data. */
  @Get()
  hello(): ServerHello {
    return { product: 'KVNsys Server', version: ServerVersion, protocol: ProtocolVersion };
  }
}
