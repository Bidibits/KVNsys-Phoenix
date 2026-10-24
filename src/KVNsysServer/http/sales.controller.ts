import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import {
  Accesses,
  dayTotals,
  displayPesos,
  NoShiftYet,
  parsePesos,
  pesosText,
  priceSale,
  serverMachineCode,
  shopDate,
  shopDay,
  takeCash,
  type AccessName,
  type CartLine,
  type PcIdentity,
  type Product,
  type ProductCatalog,
  type Receipt,
  type RegisterBook,
  type SalesJournal,
  type ShiftBook,
  type ShopDirectory,
  type UserAccounts,
} from '@kvnsys/core';
import {
  SaleFields,
  type DaySalesReply,
  type ReceiptOnWire,
  type ReceiptReply,
  type SaleProductOnWire,
  type SaleProductReply,
} from '@kvnsys/wire';
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
  accounts: UserAccounts;
  registers: RegisterBook;
  shifts: ShiftBook;
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
    const { parts } = await this.allow(authorization, Accesses.SalesSell);
    if (typeof typed !== 'string' || !typed.trim()) throw problem(400, 'Scan or type a code or a barcode.');
    // A value is never one product's code and another's barcode, so this finds one product at most.
    const product = (await parts.catalog.findByCode(typed)) ?? (await parts.catalog.findByBarcode(typed));
    if (!product) throw problem(404, `No product has the code or barcode ${typed.trim()}.`);
    return { product: productOnWire(product) };
  }

  @Post()
  @HttpCode(201)
  async record(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<ReceiptReply> {
    const { parts, shop, person, register } = await this.allow(authorization, Accesses.SalesSell);
    const fields = SaleFields.safeParse(body);
    if (!fields.success) throw problem(400, NotUnderstood);
    const { lines, discount } = fields.data;
    const tendered = parsePesos(fields.data.tendered);
    const expectedTotal = parsePesos(fields.data.expectedTotal);
    if (tendered === null || expectedTotal === null) throw problem(400, NotUnderstood);

    // Into the cashier's open shift: without one, there's no drawer for the cash to go into.
    const shift = await parts.shifts.current(person.id, shop.id);
    if (!shift) throw problem(409, NoShiftYet);

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
      // At the register signed in at; the shop is always the server's own.
      const lineage = { userId: person.id, machineId: register?.machineId ?? null, locationId: shop.id };
      return parts.journal.record(sale, takeCash(sale.total, tendered), shop.id, lineage, shift.id);
    });
    return { receipt: receiptOnWire(receipt), shop, cashier: person.displayName, register: register?.name ?? null };
  }

  /** A day's receipts at this shop, oldest first, and their totals. Today, by the shop's clock, when no date is given. */
  @Get()
  async day(@Headers('authorization') authorization: string | undefined, @Query('date') date: unknown): Promise<DaySalesReply> {
    const { parts, shop } = await this.allow(authorization, Accesses.SalesView);
    const day = typeof date === 'string' && date ? date : shopDate(new Date());
    const { from, to } = await saving(async () => shopDay(day));
    const receipts = await parts.journal.between(shop.id, from, to);
    const names = await namesOf(parts.accounts, receipts.map((receipt) => receipt.createdByUser));
    const totals = dayTotals(receipts);
    return {
      shop,
      date: day,
      receipts: receipts.map(({ createdByUser, subtotal, discountTotal, total, discountKind, ...receipt }) => ({
        ...receipt,
        cashier: names.get(createdByUser) ?? null,
        subtotal: pesosText(subtotal),
        discountTotal: pesosText(discountTotal),
        total: pesosText(total),
        discountKind: discountKind as 'senior' | 'pwd' | null,
      })),
      totals: { ...totals, subtotal: pesosText(totals.subtotal), discountTotal: pesosText(totals.discountTotal), total: pesosText(totals.total) },
    };
  }

  /** One receipt, as it was given. Only this shop's: another shop's receipt isn't one it gave. Declared after "find". */
  @Get(':id')
  async receipt(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<ReceiptReply> {
    const { parts, shop } = await this.allow(authorization, Accesses.SalesView);
    const receipt = await parts.journal.get(id);
    if (!receipt || receipt.locationId !== shop.id) throw problem(404, "That receipt isn't one this shop gave.");
    const names = await namesOf(parts.accounts, [receipt.createdByUser]);
    const register = receipt.machineId ? await parts.registers.get(receipt.machineId) : null;
    return { receipt: receiptOnWire(receipt), shop, cashier: names.get(receipt.createdByUser) ?? null, register: register?.name ?? null };
  }

  /** The pass and the right, checked before anything else is answered; then the server's own shop. */
  private async allow(authorization: string | undefined, access: AccessName) {
    const parts = this.operation.sales;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), access);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    const shop = await parts.shops.serverShop(parts.server, serverMachineCode(FirstShopCode));
    if (!shop) throw problem(503, NoShop);
    return { parts, shop, person: verdict.person, register: verdict.register };
  }
}

/** The names of the people with these ids, as shown: those whose account isn't on this server are left out. */
async function namesOf(accounts: UserAccounts, ids: readonly (string | null)[]): Promise<Map<string | null, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  const found = await Promise.all(unique.map(async (id) => [id, (await accounts.get(id))?.displayName] as const));
  return new Map(found.filter((entry): entry is readonly [string, string] => entry[1] !== undefined));
}
