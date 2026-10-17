import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ServerPin } from '@kvnsys/client';

export type TrustedServers = Record<string, ServerPin & { trustedAt: string }>;

export type TrustRead = { ok: true; servers: TrustedServers } | { ok: false; message: string };

/**
 * The servers this register trusts, one pinned certificate each, in their own file.
 *
 * Stricter than the settings file, on purpose. A missing file means "trusts nobody yet", which is
 * a first start. A damaged file is NOT treated the same way: quietly forgetting the pins would let
 * an impostor be trusted as if it were the first contact, which is exactly what pinning prevents.
 * So a damaged file stops all connections until someone looks at it.
 */
export class TrustFile {
  constructor(readonly path: string) {}

  read(): TrustRead {
    let text: string;
    try {
      text = readFileSync(this.path, 'utf8');
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return { ok: true, servers: {} };
      return { ok: false, message: this.damaged() };
    }
    try {
      const data = JSON.parse(text) as unknown;
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ok: false, message: this.damaged() };
      for (const entry of Object.values(data)) {
        const pin = entry as Partial<ServerPin> | null;
        if (typeof pin?.fingerprint256 !== 'string' || typeof pin.certificate !== 'string') {
          return { ok: false, message: this.damaged() };
        }
      }
      return { ok: true, servers: data as TrustedServers };
    } catch {
      return { ok: false, message: this.damaged() };
    }
  }

  /** Adds one trusted server. Written to a side file first, then swapped in. */
  remember(address: string, pin: ServerPin, servers: TrustedServers): void {
    const updated: TrustedServers = { ...servers, [address]: { ...pin, trustedAt: new Date().toISOString() } };
    mkdirSync(dirname(this.path), { recursive: true });
    const sideFile = `${this.path}.tmp`;
    writeFileSync(sideFile, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    renameSync(sideFile, this.path);
  }

  private damaged(): string {
    return (
      `This register's list of trusted servers (${this.path}) is damaged, so it won't connect to any ` +
      'server until IT checks it. Deleting the file resets this register to trust the next server it connects to.'
    );
  }
}
