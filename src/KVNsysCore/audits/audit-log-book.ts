import { shopDay } from '../selling/days.js';
import type { ChangeSource, ChangeType } from '../shared/audit-trail.js';
import { Refusal } from '../shared/refusal.js';

/**
 * Reading the audit log back: what the Audit log screen asks for and what it's given. Writing it is
 * shared/audit-trail.ts.
 */

/** The tables the log holds changes to, by their names in the database, and what a person calls each. */
export const AuditedTables = {
  products: 'Products',
  brands: 'Brands',
  manufacturers: 'Manufacturers',
  suppliers: 'Suppliers',
  categories: 'Categories',
  users: 'Users',
  roles: 'Roles',
  machines: 'Machines',
  locations: 'Shops',
} as const;
export type AuditedTable = keyof typeof AuditedTables;
export const AuditedTableNames = Object.keys(AuditedTables) as AuditedTable[];

/** Columns holding another record's id, and the table that record is in: the log shows its name instead. */
export const AuditReferences: Readonly<Record<string, AuditedTable>> = {
  category_id: 'categories',
  parent_category_id: 'categories',
  brand_id: 'brands',
  supplier_id: 'suppliers',
  manufacturer_id: 'manufacturers',
  role_id: 'roles',
  location_id: 'locations',
};

/** Columns holding true or false. */
const YesNoColumns: ReadonlySet<string> = new Set(['tracks_stock', 'has_warranty']);

/** What the forms call a column, where its database name doesn't say it the same way. */
const ColumnLabels: Readonly<Record<string, string>> = {
  category_id: 'Category',
  parent_category_id: 'Inside',
  brand_id: 'Brand',
  supplier_id: 'Supplier',
  manufacturer_id: 'Manufacturer',
  role_id: 'Role',
  location_id: 'Shop',
  retail_price: 'Price',
  cost_price: 'Cost',
  unit_of_measure: 'Unit',
  wholesale_quantity: 'Wholesale pieces',
  warranty_months: 'Warranty (months)',
  has_warranty: 'Has a warranty',
  tracks_stock: 'Selling it takes it out of stock',
  image: 'Picture',
  password_hash: 'Password',
  accesses: 'Rights',
  machine_uuid: 'Hardware id',
  machine_name: 'Computer name',
};

/** "first_name" -> "First name", for a column the forms have no other word for. */
export function columnLabel(column: string | null): string {
  if (column === null) return 'The whole record';
  const label = ColumnLabels[column];
  if (label) return label;
  const words = column.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function tableLabel(table: string): string {
  return (AuditedTables as Record<string, string>)[table] ?? table;
}

/**
 * A value as the log shows it: another record's id as that record's name, when it's still there,
 * and true or false in words. Everything else as it was logged.
 */
export function shownValue(column: string | null, value: string | null, names: ReadonlyMap<string, string>): string | null {
  if (value === null || column === null) return value;
  if (column in AuditReferences) return names.get(value) ?? value;
  if (YesNoColumns.has(column)) return value === 'true' ? 'Yes' : value === 'false' ? 'No' : value;
  return value;
}

/** The newest this many changes are shown; the filters find older ones. */
export const AuditLimit = 500;

/** Stands for "nobody": the changes KVNsys made itself, setting a shop up or recording a PC. */
export const ByKVNsys = 'kvnsys';

/** What to look for. Each part left empty means any. `to` is the end of the last day, not included. */
export interface AuditFilter {
  table: AuditedTable | null;
  recordId: string | null;
  /** A person's id, or ByKVNsys. */
  person: string | null;
  from: Date | null;
  to: Date | null;
}

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(message: string): never {
  throw new Refusal('invalid', message);
}

/** The filters as typed and picked (empty for any), checked: a day is a shop day, by Philippine time. */
export function checkAuditFilter(typed: { table?: string; record?: string; person?: string; from?: string; to?: string }): AuditFilter {
  const text = (value: string | undefined) => (value ?? '').trim();
  const table = text(typed.table);
  if (table && !AuditedTableNames.includes(table as AuditedTable)) refuse(`The audit log has no table called "${table}".`);
  const record = text(typed.record);
  if (record && !Uuid.test(record)) refuse("That record isn't one the audit log knows.");
  const person = text(typed.person);
  if (person && person !== ByKVNsys && !Uuid.test(person)) refuse("That person isn't one the audit log knows.");
  const from = text(typed.from) ? shopDay(text(typed.from)).from : null;
  const to = text(typed.to) ? shopDay(text(typed.to)).to : null;
  if (from && to && from >= to) refuse('The first day comes after the last one. Swap them round.');
  return { table: (table || null) as AuditedTable | null, recordId: record || null, person: person || null, from, to };
}

/** One change as the screen shows it: names, not ids, wherever the record named is still there. */
export interface AuditEntry {
  id: string;
  /** When, by the server's clock: an ISO date and time. */
  at: string;
  table: string;
  tableLabel: string;
  recordId: string;
  /** The record's name now; null if it isn't there. */
  recordName: string | null;
  column: string | null;
  columnLabel: string;
  before: string | null;
  after: string | null;
  changeType: ChangeType;
  source: ChangeSource;
  /** Null when KVNsys made the change itself. */
  userId: string | null;
  userName: string | null;
  machineName: string | null;
  shopName: string | null;
}

/** Someone who has made a change, for the screen's "who" choice. */
export interface AuditPerson {
  id: string;
  name: string;
}

export interface AuditPage {
  /** Newest first, at most AuditLimit. */
  entries: AuditEntry[];
  /** More changes match than were sent. */
  more: boolean;
  /** Everyone who has made a change, by name. */
  people: AuditPerson[];
  /** Whether KVNsys itself has made any. */
  byKVNsys: boolean;
}

/** The audit log, read back. KVNsysCore only describes it; KVNsysPostgres provides the real one. */
export abstract class AuditLogBook {
  abstract search(filter: AuditFilter): Promise<AuditPage>;
}
