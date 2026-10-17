import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadServerSettings, serverSettingsFile } from '@kvnsys/server';
import { afterEach, describe, expect, it } from 'vitest';

let dir: string | undefined;

/** A server folder that belongs to one test, so tests never touch this PC's real server settings. */
function serverFolder(settings?: string): string {
  dir = mkdtempSync(join(tmpdir(), 'kvnsys-server-settings-'));
  if (settings !== undefined) writeFileSync(serverSettingsFile(dir), settings);
  return dir;
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('loadServerSettings', () => {
  it('reads the settings file next to the certificate into the environment', () => {
    const env: NodeJS.ProcessEnv = {};
    const folder = serverFolder('DATABASE_URL=postgresql://kvnsys@localhost:5432/kvnsys\nKVNSYS_PORT=9100\n');
    expect(loadServerSettings(folder, env)).toEqual({ file: join(folder, 'server.env'), found: true });
    expect(env).toEqual({ DATABASE_URL: 'postgresql://kvnsys@localhost:5432/kvnsys', KVNSYS_PORT: '9100' });
  });

  it('lets a setting already in the environment win, so running from source behaves as before', () => {
    const env: NodeJS.ProcessEnv = { DATABASE_URL: 'postgresql://from-dot-env/phoenix_dev' };
    loadServerSettings(serverFolder('DATABASE_URL=postgresql://from-settings-file/kvnsys\n'), env);
    expect(env.DATABASE_URL).toBe('postgresql://from-dot-env/phoenix_dev');
  });

  it('changes nothing when there is no settings file', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(loadServerSettings(serverFolder(), env)).toMatchObject({ found: false });
    expect(env).toEqual({});
  });
});
