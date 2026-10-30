import type { Lineage } from '../shared/lineage.js';
import type { Listed } from '../shared/record-history.js';
import { Refusal } from '../shared/refusal.js';

/**
 * The catalogue's own lists (SCHEMA-PLAN 12–15): who the shop buys from, and the brands,
 * makers and categories a product is filed under. They share one shape, so one description below
 * says what each has, and one list screen, one form and one set of server calls serve all four.
 */
export const CatalogLists = ['suppliers', 'brands', 'manufacturers', 'categories'] as const;
export type CatalogList = (typeof CatalogLists)[number];

/** What one list is, and which fields beyond the shared ones it has. */
export interface CatalogListShape {
  /** "Suppliers": a list's name, as a heading. */
  title: string;
  /** "supplier": one entry, in a sentence. */
  one: string;
  /** A supplier has an address. */
  hasAddress: boolean;
  /** A category can sit inside another category. */
  hasParent: boolean;
}

export const CatalogListShapes: Record<CatalogList, CatalogListShape> = {
  suppliers: { title: 'Suppliers', one: 'supplier', hasAddress: true, hasParent: false },
  brands: { title: 'Brands', one: 'brand', hasAddress: false, hasParent: false },
  manufacturers: { title: 'Manufacturers', one: 'manufacturer', hasAddress: false, hasParent: false },
  categories: { title: 'Categories', one: 'category', hasAddress: false, hasParent: true },
};

/** An Active entry can be chosen for a product. An Inactive one is kept, because products still name it. */
export const CatalogEntryStatuses = ['Active', 'Inactive'] as const;
export type CatalogEntryStatus = (typeof CatalogEntryStatuses)[number];

/** What a person fills in for an entry. address is a supplier's; parentId is a category's. */
export interface CatalogEntryDetails {
  code: string;
  name: string;
  address: string | null;
  /** The category this one sits inside, or none for one at the top. */
  parentId: string | null;
  status: CatalogEntryStatus;
  description: string | null;
}

export interface CatalogEntry extends CatalogEntryDetails {
  id: string;
  /** The name of the category this one sits inside, for showing. */
  parentName: string | null;
}

export const CatalogEntryLimits = { code: 40, name: 200, address: 500, description: 1000 } as const;

function refuse(message: string): never {
  throw new Refusal('invalid', message);
}

/**
 * The rules an entry meets before it's saved, wherever it came from. Hands it back tidied (spaces
 * trimmed, empty text as none) or refuses it with a message a person can act on. Whether the code
 * is taken, and whether the parent category exists, only the store can say.
 */
export function checkCatalogEntry(list: CatalogList, details: CatalogEntryDetails): CatalogEntryDetails {
  const shape = CatalogListShapes[list];
  const code = details.code.trim();
  const name = details.name.trim();
  const address = details.address?.trim() || null;
  const parentId = details.parentId?.trim() || null;
  const description = details.description?.trim() || null;

  if (!code) refuse(`A ${shape.one} needs a code.`);
  // The same rule as a product's code: it's typed and matched exactly, so a space only causes a miss.
  if (/\s/.test(code)) refuse(`A code can't contain spaces: "${code}".`);
  if (code.length > CatalogEntryLimits.code) refuse(`A code can be at most ${CatalogEntryLimits.code} characters.`);
  if (!name) refuse(`A ${shape.one} needs a name.`);
  if (name.length > CatalogEntryLimits.name) refuse(`A name can be at most ${CatalogEntryLimits.name} characters.`);
  if (address !== null) {
    if (!shape.hasAddress) refuse(`Only a supplier has an address, not a ${shape.one}.`);
    if (address.length > CatalogEntryLimits.address) refuse(`An address can be at most ${CatalogEntryLimits.address} characters.`);
  }
  if (parentId !== null && !shape.hasParent) refuse(`Only a category can sit inside another, not a ${shape.one}.`);
  if (!CatalogEntryStatuses.includes(details.status)) {
    refuse(`A ${shape.one} is ${CatalogEntryStatuses.join(' or ')}, not "${details.status}".`);
  }
  if (description !== null && description.length > CatalogEntryLimits.description) {
    refuse(`A description can be at most ${CatalogEntryLimits.description} characters.`);
  }
  return { code, name, address, parentId, status: details.status, description };
}

/** An entry as a form holds it: every field text, as typed. parentId is empty for none. */
export interface CatalogEntryForm {
  code: string;
  name: string;
  address: string;
  parentId: string;
  status: string;
  description: string;
}

/** A new entry starts empty, and Active. */
export function blankCatalogEntryForm(): CatalogEntryForm {
  return { code: '', name: '', address: '', parentId: '', status: 'Active', description: '' };
}

export function catalogEntryFormFor(entry: CatalogEntryDetails): CatalogEntryForm {
  return {
    code: entry.code,
    name: entry.name,
    address: entry.address ?? '',
    parentId: entry.parentId ?? '',
    status: entry.status,
    description: entry.description ?? '',
  };
}

/** What was typed, as an entry that meets the rules (checkCatalogEntry), or a refusal in plain words. */
export function readCatalogEntryForm(list: CatalogList, form: CatalogEntryForm): CatalogEntryDetails {
  return checkCatalogEntry(list, {
    code: form.code,
    name: form.name,
    address: form.address,
    parentId: form.parentId,
    status: form.status as CatalogEntryStatus,
    description: form.description,
  });
}

/**
 * Each category's name with every category above it, top first: "Appliances › Fans › Stand fans",
 * so a picker tells apart two categories with the same name in different places. A parent that
 * isn't among the entries ends the path there.
 */
export function categoryPaths(categories: Pick<CatalogEntry, 'id' | 'name' | 'parentId'>[]): Map<string, string> {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const paths = new Map<string, string>();
  for (const category of categories) {
    const names = [category.name];
    const seen = new Set([category.id]);
    let parent = category.parentId === null ? undefined : byId.get(category.parentId);
    // The store never lets the tree loop; seen stops a loop anyway, rather than hanging a screen.
    while (parent && !seen.has(parent.id)) {
      names.unshift(parent.name);
      seen.add(parent.id);
      parent = parent.parentId === null ? undefined : byId.get(parent.parentId);
    }
    paths.set(category.id, names.join(' › '));
  }
  return paths;
}

/**
 * Where the four lists are kept. KVNsysCore only describes it; KVNsysPostgres provides the real one.
 *
 * Saving checks the entry (checkCatalogEntry) and refuses a code another entry in the same list
 * already has, ignoring capitals. A category's parent has to exist, and can't be the category
 * itself or one of the categories inside it, so the tree never loops.
 */
export abstract class CatalogBook {
  /** Every entry in the list, by name. */
  abstract list(list: CatalogList): Promise<Listed<CatalogEntry>[]>;
  abstract get(list: CatalogList, id: string): Promise<CatalogEntry | null>;
  abstract create(list: CatalogList, details: CatalogEntryDetails, lineage: Lineage): Promise<CatalogEntry>;
  abstract update(list: CatalogList, id: string, details: CatalogEntryDetails, lineage: Lineage): Promise<CatalogEntry>;
}
