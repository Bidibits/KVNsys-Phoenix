import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Put, Query } from '@nestjs/common';
import {
  Accesses,
  parsePesos,
  pesosText,
  Refusal,
  type AccessName,
  type Lineage,
  type Product,
  type ProductCatalog,
  type ProductDetails,
  type RefusalKind,
} from '@kvnsys/core';
import { ProductFields, type ProductListReply, type ProductOnWire, type ProductReply } from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import type { SignedInPerson } from '../identity/sign-in.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { ProductsOperation } from './tokens.js';

const NotInCatalog = "That product isn't in the catalog.";
const StatusFor: Record<RefusalKind, number> = { invalid: 400, unauthenticated: 401, forbidden: 403, 'not-found': 404, conflict: 409 };
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toWire(product: Product): ProductOnWire {
  return { ...product, retailPrice: pesosText(product.retailPrice) };
}

/** The details as sent, with the price read into centavos. KVNsysCore's rules are checked when saving. */
function readDetails(body: unknown): ProductDetails {
  const fields = ProductFields.safeParse(body);
  if (!fields.success) throw problem(400, "The product's details didn't arrive in a form the server understands.");
  const retailPrice = parsePesos(fields.data.retailPrice);
  if (retailPrice === null) {
    throw problem(400, `"${fields.data.retailPrice}" isn't a price. Type it in pesos, like 1450.50, with at most two decimals.`);
  }
  return { ...fields.data, retailPrice };
}

/** Who saved it. Which register, and so which shop, the request came from comes with recording registers. */
function lineageOf(person: SignedInPerson): Lineage {
  return { userId: person.id, machineId: null, locationId: null };
}

/** The product calls (see KVNsysWire's products.ts). Each one checks the pass and the right first. */
@Controller('products')
export class ProductsController {
  constructor(
    @Inject(ProductsOperation)
    private readonly operation: { products: { catalog: ProductCatalog; authorizer: Authorizer } | null },
  ) {}

  @Get()
  async list(@Headers('authorization') authorization: string | undefined): Promise<ProductListReply> {
    const { catalog } = await this.allow(authorization, Accesses.ProductsView);
    return { products: (await catalog.list()).map(toWire) };
  }

  /** Declared before ":id", so "find" is never taken for an id. */
  @Get('find')
  async find(
    @Headers('authorization') authorization: string | undefined,
    @Query('code') code: unknown,
    @Query('barcode') barcode: unknown,
  ): Promise<ProductReply> {
    const { catalog } = await this.allow(authorization, Accesses.ProductsView);
    let product: Product | null;
    if (typeof code === 'string' && code.trim() && barcode === undefined) {
      product = await catalog.findByCode(code);
      if (!product) throw problem(404, `No product has the code ${code.trim()}.`);
    } else if (typeof barcode === 'string' && barcode.trim() && code === undefined) {
      product = await catalog.findByBarcode(barcode);
      if (!product) throw problem(404, `No product has the barcode ${barcode.trim()}.`);
    } else {
      throw problem(400, 'Ask for one product, by its code or by its barcode.');
    }
    return { product: toWire(product) };
  }

  @Get(':id')
  async get(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<ProductReply> {
    const { catalog } = await this.allow(authorization, Accesses.ProductsView);
    const product = Uuid.test(id) ? await catalog.get(id) : null;
    if (!product) throw problem(404, NotInCatalog);
    return { product: toWire(product) };
  }

  @Post()
  @HttpCode(201)
  async add(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<ProductReply> {
    const { catalog, person } = await this.allow(authorization, Accesses.ProductsManage);
    const details = readDetails(body);
    return { product: toWire(await saving(() => catalog.create(details, lineageOf(person)))) };
  }

  @Put(':id')
  async change(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ProductReply> {
    const { catalog, person } = await this.allow(authorization, Accesses.ProductsManage);
    if (!Uuid.test(id)) throw problem(404, NotInCatalog);
    const details = readDetails(body);
    return { product: toWire(await saving(() => catalog.update(id, details, lineageOf(person)))) };
  }

  /** The pass and the right, checked before anything else is even read. */
  private async allow(authorization: string | undefined, access: AccessName) {
    const products = this.operation.products;
    if (!products) throw problem(503, NoDatabase);
    const verdict = await products.authorizer.check(bearerToken(authorization), access);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    return { catalog: products.catalog, person: verdict.person };
  }
}

/** A refusal from the rules or the catalog becomes the matching status, with its message. */
async function saving(work: () => Promise<Product>): Promise<Product> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Refusal) throw problem(StatusFor[error.kind], error.message);
    throw error;
  }
}
