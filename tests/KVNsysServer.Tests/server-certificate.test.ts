import { existsSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { loadOrCreateServerCertificate } from '@kvnsys/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe("the server's certificate", () => {
  let root: string;
  let dir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kvnsys-server-test-'));
    dir = join(root, 'data'); // doesn't exist yet: the first start makes it
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('is made on first start, and then the very same one is used every time after', async () => {
    const first = await loadOrCreateServerCertificate(dir);
    const again = await loadOrCreateServerCertificate(dir);
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.fingerprint256).toBe(first.fingerprint256);
    expect(existsSync(join(dir, 'server-key.pem'))).toBe(true);
    expect(existsSync(join(dir, 'server-certificate.pem'))).toBe(true);
  });

  it('names KVNsys Server, and is valid from 2000 to 2099 so a register with a wrong clock still connects', async () => {
    const certificate = new X509Certificate((await loadOrCreateServerCertificate(dir)).cert);
    expect(certificate.subject).toMatch(/CN=KVNsys Server/);
    expect(new Date(certificate.validFrom).getUTCFullYear()).toBe(2000);
    expect(new Date(certificate.validTo).getUTCFullYear()).toBe(2099);
  });

  it("is marked as its own authority, which Electron's TLS needs before it will accept a pin", async () => {
    // Plain Node accepts a pinned certificate either way; the real app (BoringSSL) only accepted
    // it once this was set. The app's restart tests are what caught it.
    expect(new X509Certificate((await loadOrCreateServerCertificate(dir)).cert).ca).toBe(true);
  });

  it('refuses to quietly make a new identity when one of its two files has gone missing', async () => {
    await loadOrCreateServerCertificate(dir);
    unlinkSync(join(dir, 'server-key.pem'));
    await expect(loadOrCreateServerCertificate(dir)).rejects.toThrow(/Restore both from a backup/);
  });
});
