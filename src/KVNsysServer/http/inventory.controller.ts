import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import {
  Accesses,
  checkInventoryChange,
  InventoryLogsShown,
  Refusal,
  rightToRecordByHand,
  serverMachineCode,
  type AccessName,
  type PcIdentity,
  type ProductCatalog,
  type LocationDirectory,
  type InventoryChange,
  type InventoryLedger,
  type InventoryLogLine,
  type InventoryMovement,
  type UserAccounts,
} from '@kvnsys/core';
import {
  MovementsShown,
  InventoryMovementsRequest,
  type InventoryLogLineOnWire,
  type InventoryLogsReply,
  type MovementOnWire,
  type ProductInventoryReply,
  type InventoryItemReply,
  type InventoryListReply,
  type InventoryMovementsReply,
} from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import { FirstLocationCode } from '../setup/first-location.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { toWire } from './products.controller.js';
import { saving } from './saving.js';
import { InventoryOperation } from './tokens.js';

const NotInCatalog = "That product isn't in the catalog.";
const NotUnderstood = "The stock movements didn't arrive in a form the server understands.";
const SoldOnlyBySale = 'Goods out to a customer are recorded by the sale, not by hand.';
const NoLocation =
  "KVNsys Server can't tell which location it serves: this PC isn't recorded as any location's server. " +
  'Was the database moved here from another PC?';
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InventoryOperationParts {
  ledger: InventoryLedger;
  catalog: ProductCatalog;
  locations: LocationDirectory;
  accounts: UserAccounts;
  authorizer: Authorizer;
  /** The PC this server runs on, which says which location it serves. */
  server: PcIdentity;
}

/** A line of the inventory log as it's sent: every column, with names in place of ids. */
function logLineOnWire(line: InventoryLogLine): InventoryLogLineOnWire {
  return {
    id: line.id,
    locationName: line.locationName,
    productId: line.productId,
    productCode: line.productCode,
    productName: line.productName,
    quantityChange: line.quantityChange,
    type: line.type,
    sourceTable: line.source?.table ?? null,
    sourceId: line.source?.id ?? null,
    sourceName: line.sourceName,
    resultingOnHand: line.resultingOnHand,
    note: line.note,
    createdBy: line.createdBy,
    createdMachine: line.createdMachine,
    createdLocation: line.createdLocation,
    createdAt: line.createdAt,
  };
}

/** The inventory calls (see KVNsysWire's inventory.ts). Each one checks the pass and the right first. */
@Controller('inventory')
export class InventoryController {
  constructor(@Inject(InventoryOperation) private readonly operation: { stock: InventoryOperationParts | null }) {}

  @Get()
  async list(@Headers('authorization') authorization: string | undefined): Promise<InventoryListReply> {
    const { parts, location } = await this.allow(authorization, [Accesses.InventoryView]);
    const [products, levels] = await Promise.all([parts.catalog.list(), parts.ledger.levels(location.id)]);
    const stock = new Map(levels.map((level) => [level.productId, level.stock]));
    return { location, items: products.map((product) => ({ product: toWire(product), stock: stock.get(product.id) ?? 0 })) };
  }

  /** By what was typed or scanned: a code or a barcode, capitals ignored. Declared before ":productId". */
  @Get('find')
  async find(@Headers('authorization') authorization: string | undefined, @Query('codeOrBarcode') typed: unknown): Promise<InventoryItemReply> {
    const { parts, location } = await this.allow(authorization, [Accesses.InventoryView]);
    if (typeof typed !== 'string' || !typed.trim()) throw problem(400, 'Type or scan a code or a barcode.');
    // A value is never one product's code and another's barcode, so this finds one product at most.
    const product = (await parts.catalog.findByCode(typed)) ?? (await parts.catalog.findByBarcode(typed));
    if (!product) throw problem(404, `No product has the code or barcode ${typed.trim()}.`);
    return { location, product: toWire(product), stock: await parts.ledger.onHand(location.id, product.id) };
  }

  /** The newest lines of the inventory log, every product's, with names. Declared before ":productId". */
  @Get('logs')
  async logs(@Headers('authorization') authorization: string | undefined): Promise<InventoryLogsReply> {
    const { parts, location } = await this.allow(authorization, [Accesses.InventoryView]);
    const { lines, more } = await parts.ledger.log(location.id, InventoryLogsShown);
    return { location, lines: lines.map(logLineOnWire), more };
  }

  /** "movements" is only ever a POST, so it's never taken for a product id here. */
  @Get(':productId')
  async product(
    @Headers('authorization') authorization: string | undefined,
    @Param('productId') productId: string,
  ): Promise<ProductInventoryReply> {
    const { parts, location } = await this.allow(authorization, [Accesses.InventoryView]);
    const product = Uuid.test(productId) ? await parts.catalog.get(productId) : null;
    if (!product) throw problem(404, NotInCatalog);
    // One more than are shown, to know whether there are older ones.
    const [stock, lines] = await Promise.all([
      parts.ledger.onHand(location.id, product.id),
      parts.ledger.movements(location.id, product.id, MovementsShown + 1),
    ]);
    return {
      location,
      product: toWire(product),
      stock,
      movements: await named(parts.accounts, lines.slice(0, MovementsShown)),
      more: lines.length > MovementsShown,
    };
  }

  @Post('movements')
  @HttpCode(201)
  async record(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<InventoryMovementsReply> {
    // The rights depend on what's asked for, so the body is read first, but nothing it says is
    // answered until the pass and every right it needs have been checked.
    const request = InventoryMovementsRequest.safeParse(body);
    const lines = request.success ? request.data.movements : [];
    const rights = new Set<AccessName>([Accesses.InventoryView]);
    for (const line of lines) {
      const right = rightToRecordByHand(line.type);
      if (right) rights.add(right);
    }
    const { parts, location, person, machine } = await this.allow(authorization, [...rights]);
    if (!request.success) throw problem(400, NotUnderstood);
    if (lines.some((line) => rightToRecordByHand(line.type) === null)) throw problem(400, SoldOnlyBySale);

    const changes = lines.map((line, index): InventoryChange => {
      const change = { locationId: location.id, productId: line.productId, type: line.type, quantityChange: line.quantityChange, note: line.note, source: null };
      try {
        return checkInventoryChange(change);
      } catch (error) {
        // In a delivery of many lines, say which one.
        if (error instanceof Refusal && lines.length > 1) throw problem(400, `Line ${index + 1}: ${error.message}`);
        if (error instanceof Refusal) throw problem(400, error.message);
        throw error;
      }
    });
    // At the machine signed in at; the location is always the server's own.
    const lineage = { userId: person.id, machineId: machine?.machineId ?? null, locationId: location.id };
    const saved = await saving(() => parts.ledger.record(changes, lineage));
    return { movements: await named(parts.accounts, saved) };
  }

  /** The pass and the rights, checked before anything else is answered; then the server's own location. */
  private async allow(authorization: string | undefined, access: readonly AccessName[]) {
    const parts = this.operation.stock;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), access);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    const location = await parts.locations.serverLocation(parts.server, serverMachineCode(FirstLocationCode));
    if (!location) throw problem(503, NoLocation);
    return { parts, location, person: verdict.person, machine: verdict.machine };
  }
}

/** The lines as the wire carries them, each with the name of whoever saved it. */
async function named(accounts: UserAccounts, movements: InventoryMovement[]): Promise<MovementOnWire[]> {
  const ids = [...new Set(movements.flatMap((movement) => (movement.createdByUser ? [movement.createdByUser] : [])))];
  const names = new Map(await Promise.all(ids.map(async (id) => [id, (await accounts.get(id))?.displayName ?? null] as const)));
  return movements.map(({ locationId: _location, createdByUser, ...line }) => ({
    ...line,
    createdBy: createdByUser ? { id: createdByUser, name: names.get(createdByUser) ?? null } : null,
  }));
}
