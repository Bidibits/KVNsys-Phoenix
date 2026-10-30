import {
  blankCatalogEntryForm,
  catalogEntryFormFor,
  CatalogListShapes,
  readCatalogEntryForm,
  type CatalogEntry,
  type CatalogEntryForm,
  type CatalogEntryStatus,
  type CatalogList,
  type CatalogListShape,
  type Listed,
} from '@kvnsys/core';
import { CatalogEntryReply, CatalogListReply, catalogEntryPath, catalogPath, type CatalogEntryOnWire, type SessionPass } from '@kvnsys/wire';
import { callServer, readOrRefuse, type CallOptions, type Refused } from '../connection/server-call.js';

/** A list's entries, and what its entries have (shape), so one screen can show any of the four. */
export type CatalogListResult = { ok: true; entries: Listed<CatalogEntry>[]; shape: CatalogListShape } | Refused;
export type CatalogEntryResult = { ok: true; entry: CatalogEntry } | Refused;
/** The form to fill in, what the list's entries have, and for a category, the categories it can sit inside. */
export type CatalogEntryFormResult = { ok: true; form: CatalogEntryForm; shape: CatalogListShape; parents: CatalogEntry[] } | Refused;

const fromWire = (entry: CatalogEntryOnWire): CatalogEntry => ({ ...entry, status: entry.status as CatalogEntryStatus });

/** Every entry in a list, by name. */
export async function listCatalog(address: string, pass: SessionPass, list: CatalogList, options: CallOptions): Promise<CatalogListResult> {
  const answer = await callServer(address, pass, options, { path: catalogPath(list) }, CatalogListReply);
  return answer.ok ? { ok: true, entries: answer.reply.entries.map((entry) => ({ ...fromWire(entry), history: entry.history })), shape: CatalogListShapes[list] } : answer;
}

/**
 * The form to fill in: blank for a new entry (id null), or the entry as the server has it now. A
 * category's form also offers every other category to sit inside; the server refuses one that
 * would make the tree loop.
 */
export async function loadCatalogEntryForm(
  address: string,
  pass: SessionPass,
  list: CatalogList,
  id: string | null,
  options: CallOptions,
): Promise<CatalogEntryFormResult> {
  const shape = CatalogListShapes[list];
  let parents: CatalogEntry[] = [];
  if (shape.hasParent) {
    const all = await listCatalog(address, pass, list, options);
    if (!all.ok) return all;
    parents = all.entries.filter((entry) => entry.id !== id);
  }
  if (id === null) return { ok: true, form: blankCatalogEntryForm(), shape, parents };
  const answer = await callServer(address, pass, options, { path: catalogEntryPath(list, id) }, CatalogEntryReply);
  return answer.ok ? { ok: true, form: catalogEntryFormFor(fromWire(answer.reply.entry)), shape, parents } : answer;
}

/**
 * Saves what was typed, as a new entry (id null) or over the one with that id. Read and checked
 * here first; then the server checks again, and only it knows whether a code is taken.
 */
export async function saveCatalogEntryForm(
  address: string,
  pass: SessionPass,
  list: CatalogList,
  id: string | null,
  form: CatalogEntryForm,
  options: CallOptions,
): Promise<CatalogEntryResult> {
  const read = readOrRefuse(() => readCatalogEntryForm(list, form));
  if (!read.ok) return read;
  const answer =
    id === null
      ? await callServer(address, pass, options, { path: catalogPath(list), method: 'POST', body: read.value }, CatalogEntryReply)
      : await callServer(address, pass, options, { path: catalogEntryPath(list, id), method: 'PUT', body: read.value }, CatalogEntryReply);
  return answer.ok ? { ok: true, entry: fromWire(answer.reply.entry) } : answer;
}
