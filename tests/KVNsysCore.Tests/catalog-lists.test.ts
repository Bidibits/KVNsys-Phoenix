import {
  blankCatalogEntryForm,
  catalogEntryFormFor,
  CatalogLists,
  CatalogListShapes,
  categoryPaths,
  checkCatalogEntry,
  readCatalogEntryForm,
  type CatalogEntryDetails,
} from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

const refusalOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return error as { name: string; kind: string; message: string };
  }
  return null;
};

const hanabishi: CatalogEntryDetails = { code: 'BR-001', name: 'Hanabishi', address: null, parentId: null, status: 'Active', description: null };

describe("the catalogue's lists", () => {
  it('are described once each, and only suppliers have an address and only categories a parent', () => {
    expect(CatalogLists).toEqual(['suppliers', 'brands', 'manufacturers', 'categories']);
    expect(CatalogLists.filter((list) => CatalogListShapes[list].hasAddress)).toEqual(['suppliers']);
    expect(CatalogLists.filter((list) => CatalogListShapes[list].hasParent)).toEqual(['categories']);
  });
});

describe('an entry', () => {
  it('is tidied: spaces trimmed, empty text as none', () => {
    expect(checkCatalogEntry('brands', { ...hanabishi, code: ' BR-001 ', name: ' Hanabishi ', description: '  ' })).toEqual(hanabishi);
    expect(checkCatalogEntry('suppliers', { ...hanabishi, address: '  Lucena City ' }).address).toBe('Lucena City');
  });

  it('needs a code without spaces and a name, both within their limits', () => {
    expect(refusalOf(() => checkCatalogEntry('brands', { ...hanabishi, code: ' ' }))).toMatchObject({ kind: 'invalid', message: 'A brand needs a code.' });
    expect(refusalOf(() => checkCatalogEntry('brands', { ...hanabishi, code: 'BR 001' }))).toMatchObject({ message: 'A code can\'t contain spaces: "BR 001".' });
    expect(refusalOf(() => checkCatalogEntry('suppliers', { ...hanabishi, name: '' }))).toMatchObject({ message: 'A supplier needs a name.' });
    expect(refusalOf(() => checkCatalogEntry('brands', { ...hanabishi, code: 'x'.repeat(41) }))).toMatchObject({ message: /at most 40/ });
    expect(refusalOf(() => checkCatalogEntry('brands', { ...hanabishi, name: 'x'.repeat(201) }))).toMatchObject({ message: /at most 200/ });
  });

  it('takes an address only for a supplier, and a parent only for a category', () => {
    expect(refusalOf(() => checkCatalogEntry('brands', { ...hanabishi, address: 'Lucena' }))).toMatchObject({ message: 'Only a supplier has an address, not a brand.' });
    expect(refusalOf(() => checkCatalogEntry('suppliers', { ...hanabishi, parentId: 'cat-1' }))).toMatchObject({
      message: 'Only a category can sit inside another, not a supplier.',
    });
    expect(checkCatalogEntry('categories', { ...hanabishi, parentId: ' cat-1 ' }).parentId).toBe('cat-1');
  });

  it('is Active or Inactive', () => {
    expect(refusalOf(() => checkCatalogEntry('manufacturers', { ...hanabishi, status: 'Gone' as never }))).toMatchObject({
      message: 'A manufacturer is Active or Inactive, not "Gone".',
    });
  });

  it('round-trips through its form', () => {
    const entry = { ...hanabishi, id: 'e1', parentName: null, description: 'Fans and appliances' };
    expect(readCatalogEntryForm('brands', catalogEntryFormFor(entry))).toEqual({ ...hanabishi, description: 'Fans and appliances' });
    expect(blankCatalogEntryForm()).toEqual({ code: '', name: '', address: '', parentId: '', status: 'Active', description: '' });
  });
});

describe("a category's path", () => {
  it('names each category with every one above it, top first, and survives a loop or a missing parent', () => {
    const at = (id: string, name: string, parentId: string | null) => ({ id, name, parentId });
    const paths = categoryPaths([at('stand', 'Stand fans', 'fans'), at('fans', 'Fans', 'app'), at('app', 'Appliances', null), at('lost', 'Lost', 'gone')]);
    expect(Object.fromEntries(paths)).toEqual({
      stand: 'Appliances › Fans › Stand fans',
      fans: 'Appliances › Fans',
      app: 'Appliances',
      lost: 'Lost',
    });
    expect(categoryPaths([at('a', 'A', 'b'), at('b', 'B', 'a')]).get('a')).toBe('B › A');
  });
});
