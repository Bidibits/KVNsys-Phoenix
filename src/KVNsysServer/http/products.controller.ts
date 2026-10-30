import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Put, Query } from '@nestjs/common';
import {
  Accesses,
  checkProductPicture,
  parsePesos,
  pesosText,
  readRetailPrice,
  Refusal,
  type AccessName,
  type Product,
  type ProductCatalog,
  type ProductDetails,
} from '@kvnsys/core';
import { ProductFields, type ProductListReply, type ProductOnWire, type ProductPictureReply, type ProductReply } from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { lineageOf, saving } from './saving.js';
import { ProductsOperation } from './tokens.js';

const NotInCatalog = "That product isn't in the catalog.";
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toWire(product: Product): ProductOnWire {
  const pesos = (centavos: number | null) => (centavos === null ? null : pesosText(centavos));
  return {
    ...product,
    retailPrice: pesosText(product.retailPrice),
    costPrice: pesosText(product.costPrice),
    promoPrice: pesos(product.promoPrice),
    wholesalePrice: pesos(product.wholesalePrice),
  };
}

/** One of the other prices as sent: pesos text, or a refusal naming it. */
function readPrice(text: string, what: string): number {
  const centavos = parsePesos(text);
  if (centavos === null) throw new Refusal('invalid', `The ${what} "${text}" isn't a price.`);
  return centavos;
}

/** A picture as sent: base64 text that has to come out as a JPEG KVNsysCore takes (checkProductPicture). */
function readPicture(text: string): Uint8Array {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Refusal('invalid', "The product's picture didn't arrive whole.");
  return checkProductPicture(Buffer.from(text, 'base64'));
}

/**
 * The details as sent, with the prices read into centavos, and the picture if one was sent:
 * undefined keeps the one it has, null takes it away. KVNsysCore's rules are checked when saving.
 */
function readDetails(body: unknown): { details: ProductDetails; picture: Uint8Array | null | undefined } {
  const fields = ProductFields.safeParse(body);
  if (!fields.success) throw problem(400, "The product's details didn't arrive in a form the server understands.");
  const { picture, retailPrice, costPrice, promoPrice, wholesalePrice, ...rest } = fields.data;
  try {
    return {
      details: {
        ...rest,
        retailPrice: readRetailPrice(retailPrice),
        costPrice: readPrice(costPrice, 'cost'),
        promoPrice: promoPrice === null ? null : readPrice(promoPrice, 'promo price'),
        wholesalePrice: wholesalePrice === null ? null : readPrice(wholesalePrice, 'wholesale price'),
      },
      picture: picture === undefined || picture === null ? picture : readPicture(picture),
    };
  } catch (error) {
    if (error instanceof Refusal) throw problem(400, error.message);
    throw error;
  }
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
    return { products: (await catalog.list()).map((product) => ({ ...toWire(product), history: product.history })) };
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

  @Get(':id/picture')
  async picture(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<ProductPictureReply> {
    const { catalog } = await this.allow(authorization, Accesses.ProductsView);
    const product = Uuid.test(id) ? await catalog.get(id) : null;
    if (!product) throw problem(404, NotInCatalog);
    const picture = await catalog.picture(id);
    return { picture: picture === null ? null : Buffer.from(picture).toString('base64') };
  }

  @Post()
  @HttpCode(201)
  async add(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<ProductReply> {
    const { catalog, person, register } = await this.allow(authorization, Accesses.ProductsManage);
    const { details, picture } = readDetails(body);
    return { product: toWire(await saving(() => catalog.create(details, lineageOf(person, register), picture ?? null))) };
  }

  @Put(':id')
  async change(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ProductReply> {
    const { catalog, person, register } = await this.allow(authorization, Accesses.ProductsManage);
    if (!Uuid.test(id)) throw problem(404, NotInCatalog);
    const { details, picture } = readDetails(body);
    return { product: toWire(await saving(() => catalog.update(id, details, lineageOf(person, register), picture))) };
  }

  /** The pass and the right, checked before anything else is even read. */
  private async allow(authorization: string | undefined, access: AccessName) {
    const products = this.operation.products;
    if (!products) throw problem(503, NoDatabase);
    const verdict = await products.authorizer.check(bearerToken(authorization), access);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    return { catalog: products.catalog, person: verdict.person, register: verdict.register };
  }
}
