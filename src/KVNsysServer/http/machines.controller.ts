import { Body, Controller, Get, Headers, Inject, Param, Put } from '@nestjs/common';
import {
  Accesses,
  checkMachineDetails,
  serverMachineCode,
  type AccessName,
  type PcIdentity,
  type Machine,
  type MachineBook,
  type LocationDirectory,
} from '@kvnsys/core';
import { MachineFields, type MachineListReply, type MachineOnWire, type MachineReply } from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import type { Sessions } from '../identity/sessions.js';
import { FirstLocationCode } from '../setup/first-location.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { lineageOf, saving } from './saving.js';
import { MachinesOperation } from './tokens.js';

const NotThere = "That machine isn't one of this location's.";
const NoLocation =
  "KVNsys Server can't tell which location it serves: this PC isn't recorded as any location's server. " +
  'Was the database moved here from another PC?';

export interface MachinesOperationParts {
  machines: MachineBook;
  locations: LocationDirectory;
  authorizer: Authorizer;
  sessions: Sessions;
  server: PcIdentity;
}

function toWire({ locationId: _location, ...machine }: Machine): MachineOnWire {
  return machine;
}

/** The machine calls (see KVNsysWire's machines.ts). Each one checks the pass and the right first. */
@Controller('machines')
export class MachinesController {
  constructor(@Inject(MachinesOperation) private readonly operation: { machines: MachinesOperationParts | null }) {}

  @Get()
  async list(@Headers('authorization') authorization: string | undefined): Promise<MachineListReply> {
    const { parts, location } = await this.allow(authorization, Accesses.MachinesView);
    return { machines: (await parts.machines.list(location.id)).map((machine) => ({ ...toWire(machine), history: machine.history, locationName: location.name })) };
  }

  @Put(':id')
  async change(@Headers('authorization') authorization: string | undefined, @Param('id') id: string, @Body() body: unknown): Promise<MachineReply> {
    const { parts, location, person, machine: at } = await this.allow(authorization, Accesses.MachinesManage);
    const fields = MachineFields.safeParse(body);
    if (!fields.success) throw problem(400, "The machine's details didn't arrive in a form the server understands.");
    const current = await parts.machines.get(id);
    if (!current || current.locationId !== location.id) throw problem(404, NotThere);
    const machine = await saving(async () => parts.machines.update(id, checkMachineDetails(fields.data), lineageOf(person, at)));
    // Switched off: whoever is signed in at it is signed out now, not at their next sign-in.
    if (machine.status !== 'Active') parts.sessions.cancelForMachine(machine.id);
    return { machine: toWire(machine) };
  }

  /** The pass and the right, checked before anything else is answered; then the server's own location. */
  private async allow(authorization: string | undefined, access: AccessName) {
    const parts = this.operation.machines;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), access);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    const location = await parts.locations.serverLocation(parts.server, serverMachineCode(FirstLocationCode));
    if (!location) throw problem(503, NoLocation);
    return { parts, location, person: verdict.person, machine: verdict.machine };
  }
}
