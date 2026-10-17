import { get } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { createServer, createServerCertificate, ServerVersion, type ServerCertificate } from '@kvnsys/server';
import { HelloPath, ProtocolVersion, ServerHello, SignInPath } from '@kvnsys/wire';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { httpsJson } from './https.js';

describe('KVNsys Server, over real HTTPS', () => {
  let certificate: ServerCertificate;
  let app: INestApplication;
  let port: number;
  let base: string;

  beforeAll(async () => {
    certificate = await createServerCertificate();
    app = await createServer({ logger: false, certificate });
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
    base = `https://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('answers hello with what it is, its version, and the protocol it speaks', async () => {
    const response = await httpsJson(base + HelloPath, { ca: certificate.cert });
    expect(response.status).toBe(200);
    expect(ServerHello.parse(response.body)).toEqual({ product: 'KVNsys Server', version: ServerVersion, protocol: ProtocolVersion });
  });

  it('says it cannot sign anyone in when it was started without a database', async () => {
    const response = await httpsJson(base + SignInPath, {
      ca: certificate.cert,
      method: 'POST',
      body: { username: 'admin', password: 'x' },
    });
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ signedIn: false, message: expect.stringMatching(/isn't connected to its database/) });
  });

  it('answers an address it has nothing at with "not found"', async () => {
    expect((await httpsJson(`${base}/api/no-such-thing`, { ca: certificate.cert })).status).toBe(404);
  });

  it('gives nothing to plain HTTP: no hello, no answer at all', async () => {
    const outcome = await new Promise<string>((resolve) => {
      const req = get(`http://127.0.0.1:${port}${HelloPath}`, (res) => resolve(`answered ${res.statusCode}`));
      req.on('error', (error) => resolve(`refused: ${(error as { code?: string }).code ?? error.message}`));
      req.setTimeout(3000, () => req.destroy(new Error('no answer')));
    });
    expect(outcome).not.toMatch(/answered 200/);
  });
});
