import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** What the app remembers on this PC between runs. */
export interface ClientSettings {
  /** The KVNsys Server this register last connected to, such as "http://192.168.0.111:9000". */
  serverAddress?: string;
}

/**
 * The app's settings, kept in one small JSON file. A missing or damaged file means "nothing
 * remembered yet": the app asks again instead of refusing to start.
 */
export class SettingsFile {
  constructor(readonly path: string) {}

  load(): ClientSettings {
    let text: string;
    try {
      text = readFileSync(this.path, 'utf8');
    } catch {
      return {};
    }
    try {
      const data = JSON.parse(text) as { serverAddress?: unknown } | null;
      const address = data?.serverAddress;
      return typeof address === 'string' && address.length > 0 && address.length <= 200 ? { serverAddress: address } : {};
    } catch {
      return {};
    }
  }

  /**
   * Written to a side file first, then swapped into place, so a power cut halfway through can
   * never leave half a settings file behind.
   */
  save(settings: ClientSettings): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const sideFile = `${this.path}.tmp`;
    writeFileSync(sideFile, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    renameSync(sideFile, this.path);
  }
}
