import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** What the dashboard remembers. It belongs to the PC, so it's kept in the server's own folder. */
export interface DashboardSettings {
  /** Turn the server off when the dashboard's window closes. Off unless someone ticks it. */
  stopServerOnClose: boolean;
}

export const DashboardSettingsFile = 'dashboard.json';

const Defaults: DashboardSettings = { stopServerOnClose: false };

/** Missing or damaged means the defaults: closing the window leaves the server running. */
export function loadDashboardSettings(dataDir: string): DashboardSettings {
  try {
    const saved = JSON.parse(readFileSync(join(dataDir, DashboardSettingsFile), 'utf8')) as { stopServerOnClose?: unknown } | null;
    return { stopServerOnClose: saved?.stopServerOnClose === true };
  } catch {
    return { ...Defaults };
  }
}

/** Written to a side file first, then swapped into place, so a power cut can't leave half a file. */
export function saveDashboardSettings(dataDir: string, settings: DashboardSettings): void {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, DashboardSettingsFile);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(settings, null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}
