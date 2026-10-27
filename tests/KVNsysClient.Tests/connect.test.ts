import { createServer as createPlainServer } from 'node:http';
import { createServer as createSecureServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import type { RequestListener } from 'node:http';
import {
  connectToServer,
  joinServer,
  mismatchMessage,
  normalizeServerAddress,
  type ServerPin,
  type ServerTrust,
} from '@kvnsys/client';
import { createServer, createServerCertificate, ServerPassword, ServerVersion, type ServerCertificate } from '@kvnsys/server';
import { ProtocolVersion } from '@kvnsys/wire';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** The trust a register keeps, in memory: enough to watch what gets pinned. */
class MemoryTrust implements ServerTrust {
  pins = new Map<string, ServerPin>();
  pinFor(address: string) {
    return this.pins.get(address) ?? null;
  }
  remember(address: string, pin: ServerPin) {
    this.pins.set(address, pin);
  }
}

async function listen(server: Server | ReturnType<typeof createPlainServer>) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    address: `127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/** A stand-in HTTPS server that answers however a test needs, with its own certificate. */
async function fakeServer(certificate: ServerCertificate, handler: RequestListener) {
  return listen(createSecureServer({ key: certificate.key, cert: certificate.cert }, handler));
}

const json = (status: number, body: unknown): RequestListener => (_, res) => {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
};

describe('normalizeServerAddress', () => {
  it.each([
    ['192.168.0.111', 'https://192.168.0.111:9000'],
    ['192.168.0.111:9100', 'https://192.168.0.111:9100'],
    ['  https://Server-PC:9000  ', 'https://server-pc:9000'],
    ['http://192.168.0.111:9000', 'https://192.168.0.111:9000'],
    ['https://server-pc:443', 'https://server-pc:443'],
    ['[::1]:9000', 'https://[::1]:9000'],
  ])('reads %j as %j', (typed, address) => {
    expect(normalizeServerAddress(typed)).toBe(address);
  });

  it.each(['', '   ', 'two words', 'ftp://server-pc', '192.168.0.111/api', 'server-pc:notaport', 'https://user:pw@server-pc'])(
    'turns down %j',
    (typed) => {
      expect(normalizeServerAddress(typed)).toBeNull();
    },
  );
});

describe('connectToServer', () => {
  let certificate: ServerCertificate;
  let otherCertificate: ServerCertificate;
  let kvnsys: Awaited<ReturnType<typeof createServer>>;
  let kvnsysAddress: string;

  beforeAll(async () => {
    [certificate, otherCertificate] = await Promise.all([createServerCertificate(), createServerCertificate()]);
    kvnsys = await createServer({ logger: false, certificate });
    await kvnsys.listen(0, '127.0.0.1');
    kvnsysAddress = `127.0.0.1:${(kvnsys.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await kvnsys?.close();
  });

  it('trusts a KVNsys Server the first time, and remembers its certificate', async () => {
    const trust = new MemoryTrust();
    const result = await connectToServer(kvnsysAddress, { trust });
    expect(result).toEqual({
      ok: true,
      server: { address: `https://${kvnsysAddress}`, version: ServerVersion, protocol: ProtocolVersion, firstTrust: true, needsServerPassword: false },
    });
    expect(trust.pinFor(`https://${kvnsysAddress}`)?.fingerprint256).toBe(certificate.fingerprint256);
  });

  it('connects again to the same server without trusting it afresh', async () => {
    const trust = new MemoryTrust();
    await connectToServer(kvnsysAddress, { trust });
    const again = await connectToServer(kvnsysAddress, { trust });
    expect(again).toMatchObject({ ok: true, server: { firstTrust: false } });
  });

  it('refuses an impostor: a different certificate where a trusted server should be', async () => {
    const impostor = await fakeServer(otherCertificate, json(200, { product: 'KVNsys Server', version: '0.1.0', protocol: ProtocolVersion, serverPassword: false }));
    try {
      const trust = new MemoryTrust();
      const realPin = { fingerprint256: certificate.fingerprint256, certificate: certificate.cert };
      trust.remember(`https://${impostor.address}`, realPin); // this address was trusted to be the real server
      const result = await connectToServer(impostor.address, { trust });
      expect(result).toMatchObject({ ok: false, reason: 'not-trusted' });
      expect(result.ok || result.message).toMatch(/isn't the one this register trusts/);
      expect(trust.pinFor(`https://${impostor.address}`)).toEqual(realPin); // and the real pin is kept
    } finally {
      await impostor.close();
    }
  });

  it("doesn't trust anything that turns out not to be a KVNsys Server", async () => {
    const other = await fakeServer(otherCertificate, json(200, { hello: 'world' }));
    try {
      const trust = new MemoryTrust();
      expect(await connectToServer(other.address, { trust })).toMatchObject({ ok: false, reason: 'not-kvnsys' });
      expect(trust.pins.size).toBe(0);
    } finally {
      await other.close();
    }
  });

  it("doesn't trust a KVNsys Server it can't talk to, and says to update the app", async () => {
    const newer = await fakeServer(otherCertificate, json(200, { product: 'KVNsys Server', version: '9.9.9', protocol: ProtocolVersion + 1, serverPassword: false }));
    try {
      const trust = new MemoryTrust();
      const result = await connectToServer(newer.address, { trust });
      expect(result).toMatchObject({ ok: false, reason: 'protocol-mismatch' });
      expect(result.ok || result.message).toMatch(/Update this app/);
      expect(trust.pins.size).toBe(0);
    } finally {
      await newer.close();
    }
  });

  it('turns down a server that only speaks plain HTTP', async () => {
    const plain = await listen(createPlainServer(json(200, { product: 'KVNsys Server', version: '0.1.0', protocol: ProtocolVersion, serverPassword: false })));
    try {
      const result = await connectToServer(plain.address, { trust: new MemoryTrust(), timeoutMs: 3000 });
      expect(result).toMatchObject({ ok: false, reason: 'not-kvnsys' });
      expect(result.ok || result.message).toMatch(/not over a secure connection/);
    } finally {
      await plain.close();
    }
  });

  it('turns down something that is not an address, and says how to type one', async () => {
    const result = await connectToServer('not an address', { trust: new MemoryTrust() });
    expect(result).toMatchObject({ ok: false, reason: 'bad-address' });
    expect(result.ok || result.message).toMatch(/192\.168\.0\.111/);
  });

  it('says so when nothing is there', async () => {
    const gone = await fakeServer(otherCertificate, json(200, {}));
    await gone.close();
    const result = await connectToServer(gone.address, { trust: new MemoryTrust(), timeoutMs: 2000 });
    expect(result).toMatchObject({ ok: false, reason: 'unreachable' });
    expect(result.ok || result.message).toMatch(/Couldn't reach a server/);
  });

  it("gives up on a server that doesn't answer, instead of waiting forever", async () => {
    const silent = await fakeServer(otherCertificate, () => {});
    try {
      const result = await connectToServer(silent.address, { trust: new MemoryTrust(), timeoutMs: 500 });
      expect(result).toMatchObject({ ok: false, reason: 'unreachable' });
      expect(result.ok || result.message).toMatch(/didn't answer within 0.5 seconds/);
    } finally {
      await silent.close();
    }
  });

  it.each([
    ['answers "not found"', json(404, { statusCode: 404 })],
    ['answers with a web page', ((_, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Router</h1>')) as RequestListener],
  ])('says it is not a KVNsys Server when it %s', async (_, handler) => {
    const other = await fakeServer(otherCertificate, handler);
    try {
      expect(await connectToServer(other.address, { trust: new MemoryTrust() })).toMatchObject({ ok: false, reason: 'not-kvnsys' });
    } finally {
      await other.close();
    }
  });
});

describe('a server with a password', () => {
  let certificate: ServerCertificate;
  let kvnsys: Awaited<ReturnType<typeof createServer>>;
  let address: string;
  let trust: MemoryTrust;

  beforeAll(async () => {
    certificate = await createServerCertificate();
    kvnsys = await createServer({ logger: false, certificate });
    await kvnsys.listen(0, '127.0.0.1');
    address = `https://127.0.0.1:${(kvnsys.getHttpServer().address() as AddressInfo).port}`;
    await kvnsys.get(ServerPassword).set('shop-door-1234', 'shop-door-1234');
    trust = new MemoryTrust();
  });

  afterAll(async () => {
    await kvnsys?.close();
  });

  it('says so when the register connects', async () => {
    expect(await connectToServer(address, { trust })).toMatchObject({ ok: true, server: { needsServerPassword: true } });
  });

  it('lets the register join with the right password', async () => {
    expect(await joinServer(address, 'shop-door-1234', { pin: trust.pinFor(address) })).toEqual({ ok: true });
  });

  it('turns the wrong password down, and says it was the server password', async () => {
    const result = await joinServer(address, 'shop-door-9999', { pin: trust.pinFor(address) });
    expect(result).toEqual({ ok: false, reason: 'server-password', message: "That isn't this server's password." });
  });

  it('asks for a password before sending anything, when none was typed', async () => {
    expect(await joinServer(address, '', { pin: trust.pinFor(address) })).toMatchObject({ ok: false, reason: 'server-password' });
  });

  it('never sends the password to a server it has not pinned', async () => {
    let asked = 0;
    const listener = await fakeServer(certificate, (_req, res) => {
      asked++;
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ joined: true }));
    });
    try {
      const result = await joinServer(`https://${listener.address}`, 'shop-door-1234', { pin: null });
      expect(result).toMatchObject({ ok: false, reason: 'not-connected' });
      expect(asked).toBe(0);
    } finally {
      await listener.close();
    }
  });

  it('says a server without a password needs none', async () => {
    const open = await createServer({ logger: false, certificate: await createServerCertificate() });
    await open.listen(0, '127.0.0.1');
    try {
      const where = `127.0.0.1:${(open.getHttpServer().address() as AddressInfo).port}`;
      expect(await connectToServer(where, { trust: new MemoryTrust() })).toMatchObject({ ok: true, server: { needsServerPassword: false } });
    } finally {
      await open.close();
    }
  });
});

describe('mismatchMessage', () => {
  it('names the side that is behind', () => {
    expect(mismatchMessage(2, 3, 'https://x:9000')).toMatch(/Update this app/);
    expect(mismatchMessage(3, 2, 'https://x:9000')).toMatch(/Update KVNsys Server/);
  });
});
