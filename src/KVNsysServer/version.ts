import { readFileSync } from 'node:fs';

/** This program's version, read from its package.json. */
export const ServerVersion: string = (
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
).version;
