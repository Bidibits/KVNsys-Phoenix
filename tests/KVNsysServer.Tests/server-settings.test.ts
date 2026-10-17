import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adoptEarlierServerData, loadServerSettings, serverSettingsFile } from '@kvnsys/server';
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

describe('adoptEarlierServerData', () => {
  /** Two folders standing for the old place and the new one, with these files in the old one. */
  function oldAndNew(files: Record<string, string>) {
    const root = serverFolder();
    const from = join(root, 'old');
    const to = join(root, 'new');
    mkdirSync(from);
    for (const [name, text] of Object.entries(files)) writeFileSync(join(from, name), text);
    return { from, to };
  }
  const everything = { 'server-key.pem': 'KEY', 'server-certificate.pem': 'CERT', 'server.env': 'DATABASE_URL=old' };

  it('brings the certificate and the settings over, and leaves the originals where they were', () => {
    const { from, to } = oldAndNew(everything);
    expect(adoptEarlierServerData(from, to).sort()).toEqual(['server-certificate.pem', 'server-key.pem', 'server.env']);
    expect(readFileSync(join(to, 'server-key.pem'), 'utf8')).toBe('KEY');
    expect(existsSync(join(from, 'server-key.pem'))).toBe(true);
  });

  it('never replaces what the new folder already has', () => {
    const { from, to } = oldAndNew(everything);
    mkdirSync(to);
    writeFileSync(join(to, 'server.env'), 'DATABASE_URL=new');
    writeFileSync(join(to, 'server-key.pem'), 'NEW KEY');
    writeFileSync(join(to, 'server-certificate.pem'), 'NEW CERT');
    expect(adoptEarlierServerData(from, to)).toEqual([]);
    expect(readFileSync(join(to, 'server.env'), 'utf8')).toBe('DATABASE_URL=new');
    expect(readFileSync(join(to, 'server-key.pem'), 'utf8')).toBe('NEW KEY');
  });

  it('moves the key and the certificate only as a pair', () => {
    const { from, to } = oldAndNew({ 'server-key.pem': 'KEY' });
    expect(adoptEarlierServerData(from, to)).toEqual([]);
    expect(existsSync(join(to, 'server-key.pem'))).toBe(false);
  });

  it('does nothing when there is no earlier folder', () => {
    const root = serverFolder();
    expect(adoptEarlierServerData(join(root, 'never-made'), join(root, 'new'))).toEqual([]);
    expect(adoptEarlierServerData(null, join(root, 'new'))).toEqual([]);
    expect(existsSync(join(root, 'new'))).toBe(false);
  });
});
