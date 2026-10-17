import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

// No trailing slash: on Windows a path ending in \ before the closing quote reads as an escaped
// quote, and Electron is handed a broken path. That cost a debugging session.
const appDir = fileURLToPath(new URL('../../src/KVNsysClientApp', import.meta.url));
// The app's own copy of Electron: what a register would run.
const electronPath = createRequire(join(appDir, 'package.json'))('electron') as string;

/** A settings folder that belongs to one test, so tests never touch this PC's real settings. */
export function freshDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'kvnsys-app-test-'));
}

export function removeDataDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/** Starts the real app, keeping its settings in `dataDir`. */
export function launchApp(dataDir: string) {
  return electron.launch({
    executablePath: electronPath,
    args: [appDir],
    env: { ...(process.env as Record<string, string>), KVNSYS_APP_DATA: dataDir },
  });
}
