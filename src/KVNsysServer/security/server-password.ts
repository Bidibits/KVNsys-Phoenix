import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readNewPassword, type PasswordHasher } from '@kvnsys/core';
import { ServerPasswordFile } from '../setup/server-folder.js';

/** Off: anyone on the shop's network may sign in. On: a register must give the server password first. */
export type ServerPasswordState = 'off' | 'on' | 'damaged';

/** What a register is told when it gave no server password, or the wrong one. */
export const NeedsServerPassword = 'This server has a password. Type it to connect.';
export const WrongServerPassword = "That isn't this server's password.";
export const DamagedServerPassword =
  "KVNsys Server's password file is damaged, so nobody can connect. Set a new server password in KVNsys Server's dashboard.";

/**
 * The server password. When the server has one, a register must give it before anyone can sign in
 * there; people already signed in stay signed in. It's set and turned off from the server's
 * dashboard.
 *
 * Only a scrambled copy is kept, in the server's own folder, so it survives a restart. Without a
 * folder (tests), it's kept in memory. A file that can't be read is never taken as "off": the server
 * refuses everyone until a new password is set, rather than quietly letting anyone in.
 */
export class ServerPassword {
  private hash: string | null = null;
  private damaged = false;

  constructor(
    private readonly dir: string | null,
    private readonly hasher: PasswordHasher,
  ) {
    if (dir) this.load(join(dir, ServerPasswordFile));
  }

  state(): ServerPasswordState {
    if (this.damaged) return 'damaged';
    return this.hash === null ? 'off' : 'on';
  }

  /** Null when the register may go on, or what to tell it when it may not. */
  async check(typed: string | undefined): Promise<string | null> {
    if (this.damaged) return DamagedServerPassword;
    if (this.hash === null) return null;
    if (!typed) return NeedsServerPassword;
    return (await this.hasher.verify(typed, this.hash)) ? null : WrongServerPassword;
  }

  /** Sets a new server password, typed twice, or refuses with the reason. Replaces any earlier one. */
  async set(password: string, again: string): Promise<void> {
    readNewPassword(password, again);
    const hash = await this.hasher.hash(password);
    if (this.dir) {
      mkdirSync(this.dir, { recursive: true });
      const file = join(this.dir, ServerPasswordFile);
      // A side file swapped into place, so a power cut can't leave half a file: that would lock everyone out.
      writeFileSync(`${file}.tmp`, `${JSON.stringify({ hash })}\n`, { mode: 0o600 });
      renameSync(`${file}.tmp`, file);
    }
    this.hash = hash;
    this.damaged = false;
  }

  /** Anyone on the shop's network may sign in again. */
  turnOff(): void {
    if (this.dir) rmSync(join(this.dir, ServerPasswordFile), { force: true });
    this.hash = null;
    this.damaged = false;
  }

  private load(file: string): void {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (error) {
      if ((error as { code?: string }).code !== 'ENOENT') this.damaged = true;
      return;
    }
    try {
      const hash = (JSON.parse(text) as { hash?: unknown } | null)?.hash;
      if (typeof hash === 'string' && hash.startsWith('scrypt$')) this.hash = hash;
      else this.damaged = true;
    } catch {
      this.damaged = true;
    }
  }
}
