import { Body, Controller, Get, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import {
  Accesses,
  checkShiftNote,
  parsePesos,
  pesosText,
  serverMachineCode,
  type PcIdentity,
  type Shift,
  type ShiftBook,
  type ShopDirectory,
  type UserAccounts,
} from '@kvnsys/core';
import { CloseShiftFields, OpenShiftFields, type CurrentShiftReply, type ShiftOnWire, type ShiftReply } from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import { FirstShopCode } from '../setup/first-shop.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { lineageOf, saving } from './saving.js';
import { ShiftsOperation } from './tokens.js';

const NoShop =
  "KVNsys Server can't tell which shop it serves: this PC isn't recorded as any shop's server. " +
  'Was the database moved here from another PC?';

export interface ShiftsOperationParts {
  shifts: ShiftBook;
  shops: ShopDirectory;
  accounts: UserAccounts;
  authorizer: Authorizer;
  server: PcIdentity;
}

/** A shift as the wire carries it, with the names of who opened and closed it. */
export async function shiftOnWire(shift: Shift, accounts: UserAccounts): Promise<ShiftOnWire> {
  const name = async (id: string | null) => (id ? ((await accounts.get(id))?.displayName ?? null) : null);
  return {
    id: shift.id,
    code: shift.code,
    status: shift.status,
    openingCash: pesosText(shift.openingCash),
    cashSales: pesosText(shift.cashSales),
    receipts: shift.receipts,
    discounts: pesosText(shift.discounts),
    expectedCash: pesosText(shift.expectedCash),
    countedCash: shift.countedCash === null ? null : pesosText(shift.countedCash),
    openedAt: shift.openedAt,
    openedBy: await name(shift.openedBy),
    closedAt: shift.closedAt,
    closedBy: await name(shift.closedBy),
    note: shift.note,
  };
}

/** The shift calls (see KVNsysWire's shifts.ts): each person opens and closes their own. */
@Controller('shifts')
export class ShiftsController {
  constructor(@Inject(ShiftsOperation) private readonly operation: { shifts: ShiftsOperationParts | null }) {}

  @Get('current')
  async current(@Headers('authorization') authorization: string | undefined): Promise<CurrentShiftReply> {
    const { parts, shop, person } = await this.allow(authorization);
    const shift = await parts.shifts.current(person.id, shop.id);
    return { shift: shift && (await shiftOnWire(shift, parts.accounts)) };
  }

  @Post()
  @HttpCode(201)
  async open(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<ShiftReply> {
    const { parts, shop, person, register } = await this.allow(authorization);
    const fields = OpenShiftFields.safeParse(body);
    const openingCash = fields.success ? parsePesos(fields.data.openingCash) : null;
    if (openingCash === null) throw problem(400, "The cash in the drawer didn't arrive in a form the server understands.");
    const lineage = { ...lineageOf(person, register), locationId: shop.id };
    const shift = await saving(() => parts.shifts.open(person.id, shop.id, openingCash, lineage));
    return { shift: await shiftOnWire(shift, parts.accounts) };
  }

  @Post('current/close')
  @HttpCode(200)
  async close(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<ShiftReply> {
    const { parts, shop, person, register } = await this.allow(authorization);
    const fields = CloseShiftFields.safeParse(body);
    const countedCash = fields.success ? parsePesos(fields.data.countedCash) : null;
    if (!fields.success || countedCash === null) throw problem(400, "The cash counted didn't arrive in a form the server understands.");
    const current = await parts.shifts.current(person.id, shop.id);
    if (!current) throw problem(409, "You haven't a shift open to end.");
    const lineage = { ...lineageOf(person, register), locationId: shop.id };
    const shift = await saving(async () => parts.shifts.close(current.id, countedCash, checkShiftNote(fields.data.note), lineage));
    return { shift: await shiftOnWire(shift, parts.accounts) };
  }

  /** The pass and the right to sell, checked before anything else is answered; then the server's own shop. */
  private async allow(authorization: string | undefined) {
    const parts = this.operation.shifts;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), Accesses.SalesSell);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    const shop = await parts.shops.serverShop(parts.server, serverMachineCode(FirstShopCode));
    if (!shop) throw problem(503, NoShop);
    return { parts, shop, person: verdict.person, register: verdict.register };
  }
}
