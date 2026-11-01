import { Body, Controller, Get, Headers, Inject, Param, Put } from '@nestjs/common';
import {
  Accesses,
  checkMachineDetails,
  serverMachineCode,
  type AccessName,
  type PcIdentity,
  type Machine,
  type MachineBook,
  type ShopDirectory,
} from '@kvnsys/core';
import { MachineFields, type MachineListReply, type MachineOnWire, type MachineReply } from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import type { Sessions } from '../identity/sessions.js';
import { FirstShopCode } from '../setup/first-shop.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { lineageOf, saving } from './saving.js';
import { MachinesOperation } from './tokens.js';

const NotThere = "That machine isn't one of this shop's.";
const NoShop =
  "KVNsys Server can't tell which shop it serves: this PC isn't recorded as any shop's server. " +
  'Was the database moved here from another PC?';

export interface MachinesOperationParts {
  machines: MachineBook;
  shops: ShopDirectory;
  authorizer: Authorizer;
  sessions: Sessions;
  server: PcIdentity;
}

function toWire({ locationId: _shop, ...machine }: Machine): MachineOnWire {
  return machine;
}

/** The machine calls (see KVNsysWire's machines.ts). Each one checks the pass and the right first. */
@Controller('machines')
export class MachinesController {
  constructor(@Inject(MachinesOperation) private readonly operation: { machines: MachinesOperationParts | null }) {}

  @Get()
  async list(@Headers('authorization') authorization: string | undefined): Promise<MachineListReply> {
    const { parts, shop } = await this.allow(authorization, Accesses.MachinesView);
    return { machines: (await parts.machines.list(shop.id)).map((machine) => ({ ...toWire(machine), history: machine.history, shopName: shop.name })) };
  }

  @Put(':id')
  async change(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<MachineReply> {
    const { parts, shop, person, machine: at } = await this.allow(authorization, Accesses.MachinesManage);
    const fields = MachineFields.safeParse(body);
    if (!fields.success) throw problem(400, "The machine's details didn't arrive in a form the server understands.");
    const current = await parts.machines.get(id);
    if (!current || current.locationId !== shop.id) throw problem(404, NotThere);
    const machine = await saving(async () => parts.machines.update(id, checkMachineDetails(fields.data), lineageOf(person, at)));
    // Switched off: whoever is signed in at it is signed out now, not at their next sign-in.
    if (machine.status !== 'Active') parts.sessions.cancelForMachine(machine.id);
    return { machine: toWire(machine) };
  }

  /** The pass and the right, checked before anything else is answered; then the server's own shop. */
  private async allow(authorization: string | undefined, access: AccessName) {
    const parts = this.operation.machines;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), access);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    const shop = await parts.shops.serverShop(parts.server, serverMachineCode(FirstShopCode));
    if (!shop) throw problem(503, NoShop);
    return { parts, shop, person: verdict.person, machine: verdict.machine };
  }
}
