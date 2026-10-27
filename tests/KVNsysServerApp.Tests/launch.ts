import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';

// No trailing slash: on Windows a path ending in \ before the closing quote reads as an escaped
// quote, and Electron is handed a broken path.
const appDir = fileURLToPath(new URL('../../src/KVNsysServerApp', import.meta.url));
// The dashboard's own copy of Electron: what the server PC would run.
const electronPath = createRequire(join(appDir, 'package.json'))('electron') as string;

/** A folder that belongs to one test, so tests never touch this PC's real server. */
export function freshDir(): string {
  return mkdtempSync(join(tmpdir(), 'kvnsys-dashboard-test-'));
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/** A stand-in for the Windows service, in a file the test can read: running or not, and starting with the PC or not. */
export function pretendService(file: string, state: { state: 'running' | 'stopped'; startsWithPc: boolean }): string {
  writeFileSync(file, JSON.stringify(state));
  return file;
}

/**
 * Starts the real dashboard, looking at the server folder `serverDir` and a stand-in service in
 * `serviceFile`, never at this PC's real server or its real service.
 */
export function launchDashboard(options: { serverDir: string; serviceFile: string; appDataDir: string }) {
  return electron.launch({
    executablePath: electronPath,
    args: [appDir],
    env: {
      ...(process.env as Record<string, string>),
      KVNSYS_SERVER_DATA: options.serverDir,
      KVNSYS_PRETEND_SERVICE: options.serviceFile,
      KVNSYS_APP_DATA: options.appDataDir,
    },
  });
}
