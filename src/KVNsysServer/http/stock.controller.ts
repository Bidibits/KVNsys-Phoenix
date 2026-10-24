import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import {
  Accesses,
  checkStockChange,
  Refusal,
  rightToRecordByHand,
  serverMachineCode,
  type AccessName,
  type PcIdentity,
  type ProductCatalog,
  type ShopDirectory,
  type StockChange,
  type StockLedger,
  type StockMovement,
  type UserAccounts,
} from '@kvnsys/core';
import {
  MovementsShown,
  StockMovementsRequest,
  type MovementOnWire,
  type ProductStockReply,
  type StockListReply,
  type StockMovementsReply,
} from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import { FirstShopCode } from '../setup/first-shop.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { toWire } from './products.controller.js';
import { saving } from './saving.js';
import { StockOperation } from './tokens.js';

const NotInCatalog = "That product isn't in the catalog.";
const NotUnderstood = "The stock movements didn't arrive in a form the server understands.";
const SoldOnlyBySale = 'Goods out to a customer are recorded by the sale, not by hand.';
const NoShop =
  "KVNsys Server can't tell which shop it serves: this PC isn't recorded as any shop's server. " +
  'Was the database moved here from another PC?';
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StockOperationParts {
  ledger: StockLedger;
  catalog: ProductCatalog;
  shops: ShopDirectory;
  accounts: UserAccounts;
  authorizer: Authorizer;
  /** The PC this server runs on, which says which shop it serves. */
  server: PcIdentity;
}

/** The stock calls (see KVNsysWire's stock.ts). Each one checks the pass and the right first. */
@Controller('stock')
export class StockController {
  constructor(@Inject(StockOperation) private readonly operation: { stock: StockOperationParts | null }) {}

  @Get()
  async list(@Headers('authorization') authorization: string | undefined): Promise<StockListReply> {
    const { parts, shop } = await this.allow(authorization, [Accesses.StockView]);
    const [products, levels] = await Promise.all([parts.catalog.list(), parts.ledger.levels(shop.id)]);
    const stock = new Map(levels.map((level) => [level.productId, level.stock]));
    return { shop, items: products.map((product) => ({ product: toWire(product), stock: stock.get(product.id) ?? 0 })) };
  }

  /** "movements" is only ever a POST, so it's never taken for a product id here. */
  @Get(':productId')
  async product(
    @Headers('authorization') authorization: string | undefined,
    @Param('productId') productId: string,
  ): Promise<ProductStockReply> {
    const { parts, shop } = await this.allow(authorization, [Accesses.StockView]);
    const product = Uuid.test(productId) ? await parts.catalog.get(productId) : null;
    if (!product) throw problem(404, NotInCatalog);
    // One more than are shown, to know whether there are older ones.
    const [stock, lines] = await Promise.all([
      parts.ledger.onHand(shop.id, product.id),
      parts.ledger.movements(shop.id, product.id, MovementsShown + 1),
    ]);
    return {
      shop,
      product: toWire(product),
      stock,
      movements: await named(parts.accounts, lines.slice(0, MovementsShown)),
      more: lines.length > MovementsShown,
    };
  }

  @Post('movements')
  @HttpCode(201)
  async record(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<StockMovementsReply> {
    // The rights depend on what's asked for, so the body is read first, but nothing it says is
    // answered until the pass and every right it needs have been checked.
    const request = StockMovementsRequest.safeParse(body);
    const lines = request.success ? request.data.movements : [];
    const rights = new Set<AccessName>([Accesses.StockView]);
    for (const line of lines) {
      const right = rightToRecordByHand(line.type);
      if (right) rights.add(right);
    }
    const { parts, shop, person } = await this.allow(authorization, [...rights]);
    if (!request.success) throw problem(400, NotUnderstood);
    if (lines.some((line) => rightToRecordByHand(line.type) === null)) throw problem(400, SoldOnlyBySale);

    const changes = lines.map((line, index): StockChange => {
      const change = { locationId: shop.id, productId: line.productId, type: line.type, quantityChange: line.quantityChange, note: line.note, source: null };
      try {
        return checkStockChange(change);
      } catch (error) {
        // In a delivery of many lines, say which one.
        if (error instanceof Refusal && lines.length > 1) throw problem(400, `Line ${index + 1}: ${error.message}`);
        if (error instanceof Refusal) throw problem(400, error.message);
        throw error;
      }
    });
    // Which register it came from comes with recording registers; the shop is the server's own.
    const lineage = { userId: person.id, machineId: null, locationId: shop.id };
    const saved = await saving(() => parts.ledger.record(changes, lineage));
    return { movements: await named(parts.accounts, saved) };
  }

  /** The pass and the rights, checked before anything else is answered; then the server's own shop. */
  private async allow(authorization: string | undefined, access: readonly AccessName[]) {
    const parts = this.operation.stock;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), access);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    const shop = await parts.shops.serverShop(parts.server, serverMachineCode(FirstShopCode));
    if (!shop) throw problem(503, NoShop);
    return { parts, shop, person: verdict.person };
  }
}

/** The lines as the wire carries them, each with the name of whoever saved it. */
async function named(accounts: UserAccounts, movements: StockMovement[]): Promise<MovementOnWire[]> {
  const ids = [...new Set(movements.flatMap((movement) => (movement.createdByUser ? [movement.createdByUser] : [])))];
  const names = new Map(await Promise.all(ids.map(async (id) => [id, (await accounts.get(id))?.displayName ?? null] as const)));
  return movements.map(({ locationId: _shop, createdByUser, ...line }) => ({
    ...line,
    createdBy: createdByUser ? { id: createdByUser, name: names.get(createdByUser) ?? null } : null,
  }));
}
