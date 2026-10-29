import { ChangeSources, ChangeTypes } from '@kvnsys/core';
import { z } from 'zod';

/**
 * The audit log call. It needs a signed-in pass and a role with audits.view. It only reads: the log
 * is written by the saves themselves.
 *
 *   GET  /api/audits?table=&record=&person=&from=&to=   the newest changes that match, newest first
 *
 * Every part of the question may be left out: table is a table's database name (products, users…),
 * record a record's id, person someone's id or "kvnsys" for the changes KVNsys made itself, and
 * from and to are shop days ("2026-10-28"), both included. A refusal is a ProblemReply (see products.ts).
 */
export const AuditsPath = '/api/audits';

export const AuditEntryOnWire = z.object({
  id: z.string(),
  at: z.string(),
  table: z.string(),
  tableLabel: z.string(),
  recordId: z.string(),
  recordName: z.string().nullable(),
  column: z.string().nullable(),
  columnLabel: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
  changeType: z.enum(ChangeTypes),
  source: z.enum(ChangeSources),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  machineName: z.string().nullable(),
  shopName: z.string().nullable(),
});
export type AuditEntryOnWire = z.infer<typeof AuditEntryOnWire>;

export const AuditListReply = z.object({
  entries: z.array(AuditEntryOnWire),
  more: z.boolean(),
  people: z.array(z.object({ id: z.string(), name: z.string() })),
  byKVNsys: z.boolean(),
  /** The tables the log holds changes to, for the screen's choice: the server's list, so there's only one. */
  tables: z.array(z.object({ name: z.string(), label: z.string() })),
});
export type AuditListReply = z.infer<typeof AuditListReply>;

/** What to look for; an empty part means any. */
export interface AuditQuery {
  table: string;
  record: string;
  person: string;
  from: string;
  to: string;
}

/** The call's address with the question in it, leaving out the parts that are empty. */
export function auditsPath(query: AuditQuery): string {
  const parts = Object.entries(query).filter(([, value]) => value.trim() !== '');
  const search = new URLSearchParams(parts.map(([key, value]) => [key, value.trim()]));
  return parts.length === 0 ? AuditsPath : `${AuditsPath}?${search.toString()}`;
}
