import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** Per list (its label, such as "Products"), per column (its heading): the width a person dragged it to, such as "8.5em". */
export type KeptColumnWidths = Record<string, Record<string, string>>;

interface Keeper {
  widths: KeptColumnWidths;
  keep: (list: string, column: string, width: string) => void;
}

const Kept = createContext<Keeper | null>(null);

/**
 * Hands every wide list inside it the widths a person dragged its columns to, and where to keep a
 * new one (the app keeps them on the server, so they follow the person). Without it, a list's
 * columns can still be dragged, for as long as the list is open.
 */
export function ColumnWidthsProvider({
  widths,
  onKeep,
  children,
}: {
  widths: KeptColumnWidths;
  onKeep: (list: string, column: string, width: string) => void;
  children: ReactNode;
}) {
  const keeper = useMemo(() => ({ widths, keep: onKeep }), [widths, onKeep]);
  return <Kept.Provider value={keeper}>{children}</Kept.Provider>;
}

/** The kept widths and where to keep a new one, or null outside a ColumnWidthsProvider. */
export function useKeptColumnWidths(): Keeper | null {
  return useContext(Kept);
}
