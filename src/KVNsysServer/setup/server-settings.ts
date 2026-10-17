import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

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
