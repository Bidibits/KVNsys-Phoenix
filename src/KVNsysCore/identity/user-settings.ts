/**
 * What a person changed about how the screens look, kept on the server for them so it follows them
 * to whichever machine they sign in at (SCHEMA-PLAN 29, design-direction.md rule 7). So far: the
 * widths they dragged a list's columns to. Nothing the business records depends on it.
 */
export interface UserSettings {
  /** Per list (its name, such as "Products"), per column (its heading): the width it was dragged to, such as "8.5em". */
  columnWidths: Record<string, Record<string, string>>;
}

/** Nothing changed yet: every list as KVNsys lays it out. */
export const NoSettings: UserSettings = { columnWidths: {} };

/**
 * How narrow and how wide a column can be dragged, in its list's own text (em), so a column never
 * shrinks out of sight or grows past any screen.
 */
export const ColumnWidthLimits = { min: 3, max: 80 } as const;

/** How much one person's settings can hold: far more lists and columns than KVNsys has. */
export const UserSettingsLimits = { lists: 40, columns: 80, name: 60 } as const;

/** A width as it's kept: in em, within the limits, to two decimals. */
export function columnWidth(em: number): string {
  const within = Math.min(ColumnWidthLimits.max, Math.max(ColumnWidthLimits.min, em));
  return `${Math.round(within * 100) / 100}em`;
}

/** The em of a kept width, or null when it isn't one ("12px", "wide", or beyond the limits). */
export function readColumnWidth(text: string): number | null {
  const match = /^(\d{1,3}(?:\.\d{1,2})?)em$/.exec(text);
  if (!match) return null;
  const em = Number(match[1]);
  return em >= ColumnWidthLimits.min && em <= ColumnWidthLimits.max ? em : null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A person's settings as kept, read back. Anything that isn't a setting KVNsys knows (damaged text,
 * a width it can't use) is left out rather than refused, so a bad entry never stops a screen opening.
 */
export function readUserSettings(text: string | null): UserSettings {
  if (!text) return NoSettings;
  let kept: unknown;
  try {
    kept = JSON.parse(text);
  } catch {
    return NoSettings;
  }
  const lists = isRecord(kept) && isRecord(kept.columnWidths) ? Object.entries(kept.columnWidths) : [];
  // Built with fromEntries, so a name such as "__proto__" stays a name.
  const columnWidths = Object.fromEntries(
    lists.flatMap(([list, columns]) => {
      if (!isRecord(columns)) return [];
      const widths = Object.entries(columns).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && readColumnWidth(entry[1]) !== null);
      return widths.length > 0 ? [[list, Object.fromEntries(widths)]] : [];
    }),
  );
  return { columnWidths };
}

/** Why these settings can't be kept, or null when they can. */
export function userSettingsProblem(settings: UserSettings): string | null {
  const { lists, columns, name } = UserSettingsLimits;
  const widths = Object.entries(settings.columnWidths);
  if (widths.length > lists) return `Column widths can be kept for ${lists} lists at most.`;
  for (const [list, listWidths] of widths) {
    if (list.length === 0 || list.length > name) return `A list's name must be 1 to ${name} characters long.`;
    const entries = Object.entries(listWidths);
    if (entries.length > columns) return `Widths can be kept for ${columns} columns of a list at most.`;
    for (const [column, width] of entries) {
      if (column.length === 0 || column.length > name) return `A column's heading must be 1 to ${name} characters long.`;
      if (readColumnWidth(width) === null) {
        return `"${width}" isn't a width KVNsys keeps: it's in em, from ${ColumnWidthLimits.min} to ${ColumnWidthLimits.max}, such as "8.5em".`;
      }
    }
  }
  return null;
}

/** Where each person's settings are kept. KVNsysCore only describes it; KVNsysPostgres provides the real one. */
export abstract class UserSettingsBook {
  /** The person's settings, or NoSettings when they've never changed any. */
  abstract read(userId: string): Promise<UserSettings>;
  /** Keeps these as the person's settings, in place of what was kept. */
  abstract keep(userId: string, settings: UserSettings): Promise<void>;
}
