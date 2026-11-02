import type { UserSettings } from '@kvnsys/client';
import { ColumnWidthsProvider } from '@kvnsys/ui';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

const NoneYet: UserSettings = { columnWidths: {} };

/** The kept settings, with each width in `newer` put over the kept one for the same list and column. */
function withNewer(kept: UserSettings, newer: UserSettings): UserSettings {
  const columnWidths = { ...kept.columnWidths };
  for (const [list, columns] of Object.entries(newer.columnWidths)) columnWidths[list] = { ...columnWidths[list], ...columns };
  return { ...kept, columnWidths };
}

/**
 * The signed-in person's own settings (so far, the widths they dragged list columns to): read from
 * the server once they've signed in, and kept there again each time they drag one, so they follow
 * the person to whichever machine they sign in at. Until they arrive, or if they can't, the lists
 * are as KVNsys lays them out; a width that can't be kept still holds until signing out.
 */
export function KeptSettings({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(NoneYet);
  const latest = useRef<UserSettings>(NoneYet);
  // Saves wait for the kept settings to arrive, so a width dragged first never replaces them all,
  // and go one at a time, so the newest is the last to reach the server.
  const saves = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let open = true;
    saves.current = window.kvnsys
      .mySettings()
      .then((result) => {
        if (!open || !result.ok) return;
        latest.current = withNewer(result.settings, latest.current);
        setSettings(latest.current);
      })
      .catch(() => undefined);
    return () => {
      open = false;
    };
  }, []);

  const keep = useCallback((list: string, column: string, width: string) => {
    const now = latest.current;
    latest.current = { ...now, columnWidths: { ...now.columnWidths, [list]: { ...now.columnWidths[list], [column]: width } } };
    setSettings(latest.current);
    saves.current = saves.current.then(() => window.kvnsys.saveMySettings(latest.current)).catch(() => undefined);
  }, []);

  return (
    <ColumnWidthsProvider widths={settings.columnWidths} onKeep={keep}>
      {children}
    </ColumnWidthsProvider>
  );
}
