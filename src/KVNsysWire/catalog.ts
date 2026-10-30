import { CatalogEntryStatuses, CatalogLists } from '@kvnsys/core';
import { z } from 'zod';
import { listed } from './history.js';

/**
 * The catalogue's own lists: suppliers, brands, manufacturers and categories. Each has the same
 * calls, with <list> one of those four. They're the product catalogue's, so they take its rights:
 * products.view to look, products.manage to add or change.
 *
 *   GET  /api/catalog/<list>        every entry, by name
 *   GET  /api/catalog/<list>/<id>   one entry
 *   POST /api/catalog/<list>        add one       (201)
 *   PUT  /api/catalog/<list>/<id>   change one
 *
 * A refusal is a ProblemReply (see products.ts): 400 a rule, 401 sign in again, 403 the role may
 * not, 404 no such list or entry, 409 a code another entry in the list already has.
 */
export const CatalogListName = z.enum(CatalogLists);

export const catalogPath = (list: string) => `/api/catalog/${encodeURIComponent(list)}`;
export const catalogEntryPath = (list: string, id: string) => `${catalogPath(list)}/${encodeURIComponent(id)}`;

/** What a client sends for an entry. address is a supplier's, parentId a category's; KVNsysCore's rules are checked at the server. */
export const CatalogEntryFields = z.object({
  code: z.string().max(200),
  name: z.string().max(1000),
  address: z.string().max(2000).nullable(),
  parentId: z.string().max(100).nullable(),
  status: z.enum(CatalogEntryStatuses),
  description: z.string().max(5000).nullable(),
});
export type CatalogEntryFields = z.infer<typeof CatalogEntryFields>;

/** An entry as the server sends it, with the name of the category it sits inside. */
export const CatalogEntryOnWire = CatalogEntryFields.extend({
  id: z.string(),
  parentName: z.string().nullable(),
});
export type CatalogEntryOnWire = z.infer<typeof CatalogEntryOnWire>;

export const CatalogEntryReply = z.object({ entry: CatalogEntryOnWire });
export type CatalogEntryReply = z.infer<typeof CatalogEntryReply>;

export const CatalogListReply = z.object({ entries: z.array(listed(CatalogEntryOnWire)) });
export type CatalogListReply = z.infer<typeof CatalogListReply>;
