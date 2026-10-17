import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrustFile } from '../../src/KVNsysClientApp/dist/desktop/trust-file.js';
import { freshDataDir, removeDataDir } from './launch.js';

const pin = { fingerprint256: 'AB:CD:EF', certificate: '-----BEGIN CERTIFICATE-----\nx\n-----END CERTIFICATE-----\n' };

describe('TrustFile', () => {
  let dir: string;
  let file: TrustFile;

  beforeEach(() => {
    dir = freshDataDir();
    file = new TrustFile(join(dir, 'nested', 'trusted-servers.json'));
  });

  afterEach(() => removeDataDir(dir));

  it('trusts nobody when there is no file yet: a first start', () => {
    expect(file.read()).toEqual({ ok: true, servers: {} });
  });

  it('reads back a server it was told to trust, with when', () => {
    file.remember('https://192.168.0.111:9000', pin, {});
    const read = file.read();
    expect(read.ok && read.servers['https://192.168.0.111:9000']).toMatchObject({ ...pin, trustedAt: expect.any(String) });
    expect(readdirSync(join(dir, 'nested'))).toEqual(['trusted-servers.json']);
  });

  it('keeps the servers it already trusted when it adds one', () => {
    file.remember('https://a:9000', pin, {});
    const first = file.read();
    file.remember('https://b:9000', pin, first.ok ? first.servers : {});
    const read = file.read();
    expect(read.ok && Object.keys(read.servers).sort()).toEqual(['https://a:9000', 'https://b:9000']);
  });

  it('refuses to carry on with a damaged file, instead of quietly forgetting who it trusts', () => {
    file.remember('https://a:9000', pin, {});
    writeFileSync(file.path, '{ not json');
    const read = file.read();
    expect(read.ok).toBe(false);
    expect(read.ok || read.message).toMatch(/is damaged, so it won't connect/);
    expect(read.ok || read.message).toContain(file.path);
  });

  it('counts a file with the wrong shape as damaged too', () => {
    writeFileSync(file.path.replace(/nested.*/, 'odd.json'), '[]');
    expect(new TrustFile(file.path.replace(/nested.*/, 'odd.json')).read().ok).toBe(false);
    writeFileSync(file.path.replace(/nested.*/, 'odd2.json'), JSON.stringify({ 'https://a:9000': { fingerprint256: 1 } }));
    expect(new TrustFile(file.path.replace(/nested.*/, 'odd2.json')).read().ok).toBe(false);
  });
});
