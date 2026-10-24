import { Body, Controller, Get, Headers, Inject, Param, Put } from '@nestjs/common';
import {
  Accesses,
  checkRegisterDetails,
  serverMachineCode,
  type AccessName,
  type PcIdentity,
  type Register,
  type RegisterBook,
  type ShopDirectory,
} from '@kvnsys/core';
import { RegisterFields, type RegisterListReply, type RegisterOnWire, type RegisterReply } from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import type { Sessions } from '../identity/sessions.js';
import { FirstShopCode } from '../setup/first-shop.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { lineageOf, saving } from './saving.js';
import { RegistersOperation } from './tokens.js';

const NotThere = "That register isn't one of this shop's.";
const NoShop =
  "KVNsys Server can't tell which shop it serves: this PC isn't recorded as any shop's server. " +
  'Was the database moved here from another PC?';

export interface RegistersOperationParts {
  registers: RegisterBook;
  shops: ShopDirectory;
  authorizer: Authorizer;
  sessions: Sessions;
  server: PcIdentity;
}

function toWire({ locationId: _shop, ...register }: Register): RegisterOnWire {
  return register;
}

/** The register calls (see KVNsysWire's registers.ts). Each one checks the pass and the right first. */
@Controller('registers')
export class RegistersController {
  constructor(@Inject(RegistersOperation) private readonly operation: { registers: RegistersOperationParts | null }) {}

  @Get()
  async list(@Headers('authorization') authorization: string | undefined): Promise<RegisterListReply> {
    const { parts, shop } = await this.allow(authorization, Accesses.MachinesView);
    return { registers: (await parts.registers.list(shop.id)).map(toWire) };
  }

  @Put(':id')
  async change(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<RegisterReply> {
    const { parts, shop, person, register: at } = await this.allow(authorization, Accesses.MachinesManage);
    const fields = RegisterFields.safeParse(body);
    if (!fields.success) throw problem(400, "The register's details didn't arrive in a form the server understands.");
    const current = await parts.registers.get(id);
    if (!current || current.locationId !== shop.id) throw problem(404, NotThere);
    const register = await saving(async () => parts.registers.update(id, checkRegisterDetails(fields.data), lineageOf(person, at)));
    // Switched off: whoever is signed in at it is signed out now, not at their next sign-in.
    if (register.status !== 'Active') parts.sessions.cancelForRegister(register.id);
    return { register: toWire(register) };
  }

  /** The pass and the right, checked before anything else is answered; then the server's own shop. */
  private async allow(authorization: string | undefined, access: AccessName) {
    const parts = this.operation.registers;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), access);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    const shop = await parts.shops.serverShop(parts.server, serverMachineCode(FirstShopCode));
    if (!shop) throw problem(503, NoShop);
    return { parts, shop, person: verdict.person, register: verdict.register };
  }
}
