import { createServer as createHttpServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { connectToServer, mismatchMessage, normalizeServerAddress } from '@kvnsys/client';
import { createServer, ServerVersion } from '@kvnsys/server';
import { ProtocolVersion } from '@kvnsys/wire';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** A tiny stand-in server that answers however a test needs, on a free port. */
async function fakeServer(handler: RequestListener) {
  const server = createHttpServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    address: `127.0.0.1:${port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

const json = (status: number, body: unknown): RequestListener => (_, res) => {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
};

describe('normalizeServerAddress', () => {
  it.each([
    ['192.168.0.111', 'http://192.168.0.111:9000'],
    ['192.168.0.111:9100', 'http://192.168.0.111:9100'],
    ['  http://Server-PC:9000  ', 'http://server-pc:9000'],
    ['http://server-pc:80', 'http://server-pc:80'],
    ['[::1]:9000', 'http://[::1]:9000'],
  ])('reads %j as %j', (typed, address) => {
    expect(normalizeServerAddress(typed)).toBe(address);
  });

  it.each(['', '   ', 'two words', 'ftp://server-pc', '192.168.0.111/api', 'server-pc:notaport', 'http://user:pw@server-pc'])(
    'turns down %j',
    (typed) => {
      expect(normalizeServerAddress(typed)).toBeNull();
    },
  );
});

describe('connectToServer', () => {
  let kvnsys: Awaited<ReturnType<typeof createServer>>;
  let kvnsysAddress: string;

  beforeAll(async () => {
    kvnsys = await createServer({ logger: false });
    await kvnsys.listen(0, '127.0.0.1');
    kvnsysAddress = `127.0.0.1:${(kvnsys.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await kvnsys?.close();
  });

  it('connects to a real KVNsys Server and reports its version and protocol', async () => {
    const result = await connectToServer(kvnsysAddress);
    expect(result).toEqual({
      ok: true,
      server: { address: `http://${kvnsysAddress}`, version: ServerVersion, protocol: ProtocolVersion },
    });
  });

  it('turns down something that is not an address, and says how to type one', async () => {
    const result = await connectToServer('not an address');
    expect(result).toMatchObject({ ok: false, reason: 'bad-address' });
    expect(result.ok || result.message).toMatch(/192\.168\.0\.111/);
  });

  it('says so when nothing is there', async () => {
    const gone = await fakeServer(json(200, {}));
    await gone.close();
    const result = await connectToServer(gone.address, { timeoutMs: 2000 });
    expect(result).toMatchObject({ ok: false, reason: 'unreachable' });
    expect(result.ok || result.message).toMatch(/Couldn't reach a server/);
  });

  it("gives up on a server that doesn't answer, instead of waiting forever", async () => {
    const silent = await fakeServer(() => {});
    try {
      const result = await connectToServer(silent.address, { timeoutMs: 300 });
      expect(result).toMatchObject({ ok: false, reason: 'unreachable' });
      expect(result.ok || result.message).toMatch(/didn't answer within 0.3 seconds/);
    } finally {
      await silent.close();
    }
  });

  it.each([
    ['answers "not found"', json(404, { statusCode: 404 })],
    ['answers with something else', json(200, { hello: 'world' })],
    ['answers with a web page', ((_, res) => res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h1>Router</h1>')) as RequestListener],
  ])('says it is not a KVNsys Server when it %s', async (_, handler) => {
    const other = await fakeServer(handler);
    try {
      expect(await connectToServer(other.address)).toMatchObject({ ok: false, reason: 'not-kvnsys' });
    } finally {
      await other.close();
    }
  });

  it('refuses a KVNsys Server from a newer update, and says to update this app', async () => {
    const newer = await fakeServer(json(200, { product: 'KVNsys Server', version: '9.9.9', protocol: ProtocolVersion + 1 }));
    try {
      const result = await connectToServer(newer.address);
      expect(result).toMatchObject({ ok: false, reason: 'protocol-mismatch' });
      expect(result.ok || result.message).toMatch(/Update this app/);
    } finally {
      await newer.close();
    }
  });
});

describe('mismatchMessage', () => {
  it('names the side that is behind', () => {
    expect(mismatchMessage(2, 3, 'http://x:9000')).toMatch(/Update this app/);
    expect(mismatchMessage(3, 2, 'http://x:9000')).toMatch(/Update KVNsys Server/);
  });
});
