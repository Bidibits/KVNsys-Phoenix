import { columnWidth, NoSettings, readColumnWidth, readUserSettings, userSettingsProblem, type UserSettings } from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

/** Settings with this many lists, each with this many columns, all 9em wide. */
function widths(lists: number, columns: number): UserSettings {
  const list = Object.fromEntries(Array.from({ length: columns }, (_, column) => [`Column ${column}`, '9em']));
  return { columnWidths: Object.fromEntries(Array.from({ length: lists }, (_, at) => [`List ${at}`, list])) };
}

describe("a person's column widths", () => {
  it('are kept in em, to two decimals, never narrower than 3em or wider than 80em', () => {
    expect([columnWidth(8.456), columnWidth(12), columnWidth(1), columnWidth(-5), columnWidth(200)]).toEqual(['8.46em', '12em', '3em', '3em', '80em']);
    expect([readColumnWidth('8.5em'), readColumnWidth('3em'), readColumnWidth('80em'), readColumnWidth('12.25em')]).toEqual([8.5, 3, 80, 12.25]);
    for (const notOne of ['2.99em', '80.01em', '12px', '12', 'wide', '', '8.555em', ' 8em', '-5em']) expect(readColumnWidth(notOne), notOne).toBeNull();
  });

  it("read back leave out what KVNsys can't use, rather than refusing the lot", () => {
    expect(readUserSettings(null)).toEqual(NoSettings);
    expect(readUserSettings('not json')).toEqual(NoSettings);
    expect(readUserSettings('[1, 2]')).toEqual(NoSettings);
    expect(readUserSettings('{"columnWidths": 5}')).toEqual(NoSettings);
    const kept = { columnWidths: { Products: { Id: '8em', Name: '12px', Code: 5 }, Users: 'wide', Roles: { Name: '200em' } } };
    expect(readUserSettings(JSON.stringify(kept))).toEqual({ columnWidths: { Products: { Id: '8em' } } });
  });

  it('read back keep a name such as "__proto__" as a name', () => {
    const read = readUserSettings('{"columnWidths": {"__proto__": {"Id": "8em"}}}');
    expect(Object.getPrototypeOf(read.columnWidths)).toBe(Object.prototype);
    expect(Object.entries(read.columnWidths)).toEqual([['__proto__', { Id: '8em' }]]);
  });

  it("are refused past their limits, or with a width that isn't one", () => {
    expect(userSettingsProblem(NoSettings)).toBeNull();
    expect(userSettingsProblem(widths(40, 80))).toBeNull();
    expect(userSettingsProblem(widths(41, 1))).toBe('Column widths can be kept for 40 lists at most.');
    expect(userSettingsProblem(widths(1, 81))).toBe('Widths can be kept for 80 columns of a list at most.');
    expect(userSettingsProblem({ columnWidths: { ['L'.repeat(61)]: { Id: '9em' } } })).toBe("A list's name must be 1 to 60 characters long.");
    expect(userSettingsProblem({ columnWidths: { '': { Id: '9em' } } })).toBe("A list's name must be 1 to 60 characters long.");
    expect(userSettingsProblem({ columnWidths: { Products: { ['C'.repeat(61)]: '9em' } } })).toBe("A column's heading must be 1 to 60 characters long.");
    expect(userSettingsProblem({ columnWidths: { Products: { Id: '9px' } } })).toBe(`"9px" isn't a width KVNsys keeps: it's in em, from 3 to 80, such as "8.5em".`);
    expect(userSettingsProblem({ columnWidths: { Products: { Id: '2em' } } })).toMatch(/^"2em" isn't a width/);
  });
});
