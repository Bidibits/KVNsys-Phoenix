import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { Accesses, CatalogListShapes, checkCatalogEntry, type AccessName, type CatalogBook, type CatalogList } from '@kvnsys/core';
import { CatalogEntryFields, CatalogListName, type CatalogEntryReply, type CatalogListReply } from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { lineageOf, saving } from './saving.js';
import { CatalogOperation } from './tokens.js';

export interface CatalogOperationParts {
  book: CatalogBook;
  authorizer: Authorizer;
}

/** Which of the four lists a request names, or a 404 in words. */
function listFrom(typed: string): CatalogList {
  const list = CatalogListName.safeParse(typed);
  if (!list.success) throw problem(404, `There's no list called "${typed}".`);
  return list.data;
}

/**
 * The catalogue's lists (see KVNsysWire's catalog.ts): one set of calls for suppliers, brands,
 * manufacturers and categories. Each checks the pass and the right first; the rights are the
 * product catalogue's.
 */
@Controller('catalog/:list')
export class CatalogController {
  constructor(@Inject(CatalogOperation) private readonly operation: { catalog: CatalogOperationParts | null }) {}

  @Get()
  async list(@Headers('authorization') authorization: string | undefined, @Param('list') typed: string): Promise<CatalogListReply> {
    const { book } = await this.allow(authorization, Accesses.ProductsView);
    return { entries: await book.list(listFrom(typed)) };
  }

  @Get(':id')
  async get(
    @Headers('authorization') authorization: string | undefined,
    @Param('list') typed: string,
    @Param('id') id: string,
  ): Promise<CatalogEntryReply> {
    const { book } = await this.allow(authorization, Accesses.ProductsView);
    const list = listFrom(typed);
    const entry = await book.get(list, id);
    if (!entry) throw problem(404, `That ${CatalogListShapes[list].one} isn't there any more.`);
    return { entry };
  }

  @Post()
  @HttpCode(201)
  async add(
    @Headers('authorization') authorization: string | undefined,
    @Param('list') typed: string,
    @Body() body: unknown,
  ): Promise<CatalogEntryReply> {
    const { book, person, register } = await this.allow(authorization, Accesses.ProductsManage);
    const list = listFrom(typed);
    const fields = readFields(list, body);
    return { entry: await saving(async () => book.create(list, checkCatalogEntry(list, fields), lineageOf(person, register))) };
  }

  @Put(':id')
  async change(
    @Headers('authorization') authorization: string | undefined,
    @Param('list') typed: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<CatalogEntryReply> {
    const { book, person, register } = await this.allow(authorization, Accesses.ProductsManage);
    const list = listFrom(typed);
    const fields = readFields(list, body);
    return { entry: await saving(async () => book.update(list, id, checkCatalogEntry(list, fields), lineageOf(person, register))) };
  }

  /** The pass and the right, checked before anything else is even read. */
  private async allow(authorization: string | undefined, access: AccessName) {
    const parts = this.operation.catalog;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), access);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    return { ...parts, person: verdict.person, register: verdict.register };
  }
}

function readFields(list: CatalogList, body: unknown) {
  const fields = CatalogEntryFields.safeParse(body);
  if (!fields.success) throw problem(400, `The ${CatalogListShapes[list].one}'s details didn't arrive in a form the server understands.`);
  return fields.data;
}
