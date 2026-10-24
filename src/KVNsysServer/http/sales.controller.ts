import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Query } from '@nestjs/common';
import {
  Accesses,
  displayPesos,
  parsePesos,
  pesosText,
  priceSale,
  serverMachineCode,
  takeCash,
  type CartLine,
  type PcIdentity,
  type Product,
  type ProductCatalog,
  type Receipt,
  type SalesJournal,
  type ShopDirectory,
} from '@kvnsys/core';
import { SaleFields, type ReceiptOnWire, type ReceiptReply, type SaleProductOnWire, type SaleProductReply } from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import { FirstShopCode } from '../setup/first-shop.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { saving } from './saving.js';
import { SalesOperation } from './tokens.js';

const NotInCatalog = "That product isn't in the catalog.";
const NotUnderstood = "The sale didn't arrive in a form the server understands.";
const NoShop =
  "KVNsys Server can't tell which shop it serves: this PC isn't recorded as any shop's server. " +
  'Was the database moved here from another PC?';
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SalesOperationParts {
  journal: SalesJournal;
  catalog: ProductCatalog;
  shops: ShopDirectory;
  authorizer: Authorizer;
  /** The PC this server runs on, which says which shop it sells at. */
  server: PcIdentity;
}

function productOnWire(product: Product): SaleProductOnWire {
  return { id: product.id, code: product.code, name: product.name, retailPrice: pesosText(product.retailPrice), status: product.status };
}

function receiptOnWire(receipt: Receipt): ReceiptOnWire {
  return {
    id: receipt.id,
    code: receipt.code,
    number: receipt.number,
    lines: receipt.lines.map((line) => ({
      productId: line.productId,
      code: line.code,
      name: line.name,
      quantity: line.quantity,
      unitPrice: pesosText(line.unitPrice),
      subtotal: pesosText(line.subtotal),
      discount: pesosText(line.discount),
      total: pesosText(line.total),
    })),
    subtotal: pesosText(receipt.subtotal),
    discountTotal: pesosText(receipt.discountTotal),
    total: pesosText(receipt.total),
    discount: receipt.discount,
    payment: { type: receipt.payment.type, tendered: pesosText(receipt.payment.tendered), change: pesosText(receipt.payment.change) },
    createdAt: receipt.createdAt,
  };
}

/** The selling calls (see KVNsysWire's selling.ts). Each one checks the pass and the right first. */
@Controller('sales')
export class SalesController {
  constructor(@Inject(SalesOperation) private readonly operation: { sales: SalesOperationParts | null }) {}

  /** By what was scanned or typed: a code or a barcode, capitals ignored. */
  @Get('find')
  async find(@Headers('authorization') authorization: string | undefined, @Query('codeOrBarcode') typed: unknown): Promise<SaleProductReply> {
    const { parts } = await this.allow(authorization);
    if (typeof typed !== 'string' || !typed.trim()) throw problem(400, 'Scan or type a code or a barcode.');
    // A value is never one product's code and another's barcode, so this finds one product at most.
    const product = (await parts.catalog.findByCode(typed)) ?? (await parts.catalog.findByBarcode(typed));
    if (!product) throw problem(404, `No product has the code or barcode ${typed.trim()}.`);
    return { product: productOnWire(product) };
  }

  @Post()
  @HttpCode(201)
  async record(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<ReceiptReply> {
    const { parts, shop, person } = await this.allow(authorization);
    const fields = SaleFields.safeParse(body);
    if (!fields.success) throw problem(400, NotUnderstood);
    const { lines, discount } = fields.data;
    const tendered = parsePesos(fields.data.tendered);
    const expectedTotal = parsePesos(fields.data.expectedTotal);
    if (tendered === null || expectedTotal === null) throw problem(400, NotUnderstood);

    // Priced again from the catalog as it is now, never from what the register says a price is.
    const products = new Map<string, Product>();
    for (const id of new Set(lines.map((line) => line.productId))) {
      const product = Uuid.test(id) ? await parts.catalog.get(id) : null;
      if (!product) throw problem(404, NotInCatalog);
      products.set(id, product);
    }
    const cart: CartLine[] = lines.map((line) => ({ product: products.get(line.productId)!, quantity: line.quantity }));
    const receipt = await saving(async () => {
      const sale = priceSale(cart, discount);
      if (sale.total !== expectedTotal) {
        throw problem(
          409,
          `A price changed while this sale was being rung up: it now comes to ${displayPesos(sale.total)}, not ${displayPesos(expectedTotal)}. ` +
            'Check the cart, then take payment again.',
        );
      }
      // Which register it came from comes with recording registers; the shop is the server's own.
      return parts.journal.record(sale, takeCash(sale.total, tendered), shop.id, { userId: person.id, machineId: null, locationId: shop.id });
    });
    return { receipt: receiptOnWire(receipt), shop, cashier: person.displayName };
  }

  /** The pass and the right, checked before anything else is answered; then the server's own shop. */
  private async allow(authorization: string | undefined) {
    const parts = this.operation.sales;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), Accesses.SalesSell);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    const shop = await parts.shops.serverShop(parts.server, serverMachineCode(FirstShopCode));
    if (!shop) throw problem(503, NoShop);
    return { parts, shop, person: verdict.person };
  }
}
