import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { ServerCertificateFile, ServerKeyFile } from '../security/server-certificate.js';

/** The server's settings file. It sits next to the server's certificate, in the same folder. */
export function serverSettingsFile(dataDir: string): string {
  return join(dataDir, 'server.env');
}

/**
 * Reads the settings file, if there is one, into `env`. It's written like a .env file: one
 * NAME=value per line. A setting that's already in the environment wins, so running from source
 * with Phoenix's .env behaves exactly as before.
 */
export function loadServerSettings(dataDir: string, env: NodeJS.ProcessEnv = process.env): { file: string; found: boolean } {
  const file = serverSettingsFile(dataDir);
  if (!existsSync(file)) return { file, found: false };
  for (const [name, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (env[name] === undefined) env[name] = String(value);
  }
  return { file, found: true };
}

/**
 * Brings the server's files over from where an earlier version kept them, the first time it runs
 * from its new folder, so moving folders doesn't cost it its certificate (every register would then
 * refuse it) or its settings. Only what the new folder lacks is copied, and the originals stay
 * where they were, so going back to the earlier version still works. Returns what it copied.
 */
export function adoptEarlierServerData(from: string | null, to: string): string[] {
  if (!from || !existsSync(from)) return [];
  const copied: string[] = [];
  const copy = (name: string) => {
    mkdirSync(to, { recursive: true });
    copyFileSync(join(from, name), join(to, name));
    copied.push(name);
  };
  // The key and certificate only ever move together: one without the other is no identity at all.
  const pair = [ServerKeyFile, ServerCertificateFile];
  if (pair.every((name) => existsSync(join(from, name))) && pair.every((name) => !existsSync(join(to, name)))) {
    pair.forEach(copy);
  }
  if (existsSync(serverSettingsFile(from)) && !existsSync(serverSettingsFile(to))) copy('server.env');
  return copied;
}
