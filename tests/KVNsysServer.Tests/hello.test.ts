import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { createServer, ServerVersion } from '@kvnsys/server';
import { HelloPath, ProtocolVersion, ServerHello } from '@kvnsys/wire';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('KVNsys Server, over real HTTP', () => {
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    app = await createServer({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers hello with what it is, its version, and the protocol it speaks', async () => {
    const response = await fetch(base + HelloPath);
    expect(response.status).toBe(200);
    const hello = ServerHello.parse(await response.json());
    expect(hello).toEqual({ product: 'KVNsys Server', version: ServerVersion, protocol: ProtocolVersion });
  });

  it('answers an address it has nothing at with "not found"', async () => {
    expect((await fetch(`${base}/api/no-such-thing`)).status).toBe(404);
  });
});
