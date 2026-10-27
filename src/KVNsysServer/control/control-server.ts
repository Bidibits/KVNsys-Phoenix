import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Refusal } from '@kvnsys/core';
import { ProtocolVersion } from '@kvnsys/wire';
import { Sessions } from '../identity/sessions.js';
import { ServerPassword } from '../security/server-password.js';
import { ControlFile } from '../setup/server-folder.js';
import { ServerVersion } from '../version.js';
import {
  ControlFileContents,
  DisconnectPath,
  DisconnectRequest,
  ServerPasswordOffPath,
  ServerPasswordPath,
  ServerPasswordRequest,
  StatusPath,
  type ControlDone,
  type ServerStatus,
} from './control-shapes.js';
import { lanAddresses } from './lan-addresses.js';

export interface ServerControl {
  /** The port on 127.0.0.1 the dashboard reaches this run on. */
  port: number;
  /** Stops answering the dashboard, and takes this run's key out of the folder. */
  close(): Promise<void>;
  /** The same as close's second half, for when the process is already on its way out. */
  forgetKey(): void;
}

/** Bigger than any request the dashboard sends. */
const MaxBody = 8 * 1024;

/**
 * Lets the server's dashboard see and steer the running server: who's connected, disconnecting
 * them, and the server password. It answers only on 127.0.0.1, never on the shop's network, and
 * only to a request showing this run's key. The key is written into the server's folder, which only
 * the server's service and the PC's administrators can read, so being able to read it is what makes
 * someone allowed to steer the server. A new key every run, so an old copy is worthless.
 */
export async function startServerControl(app: INestApplication, options: { dataDir: string; port: number }): Promise<ServerControl> {
  const sessions = app.get(Sessions);
  const serverPassword = app.get(ServerPassword);
  const key = randomBytes(32).toString('base64url');
  const startedAt = new Date().toISOString();

  const status = (): ServerStatus => ({
    version: ServerVersion,
    protocol: ProtocolVersion,
    port: options.port,
    addresses: lanAddresses(),
    startedAt,
    serverPassword: serverPassword.state(),
    connected: sessions.list().map((session) => ({
      id: session.id,
      username: session.user.username,
      displayName: session.user.displayName,
      register: session.register && { code: session.register.code, name: session.register.name },
      since: session.startedAt.toISOString(),
    })),
  });

  async function answer(request: IncomingMessage): Promise<{ status: number; body: unknown }> {
    if (!showsKey(request.headers.authorization, key)) return { status: 401, body: { ok: false, message: 'Wrong key.' } };
    const route = `${request.method} ${request.url}`;
    if (route === `GET ${StatusPath}`) return { status: 200, body: status() };

    const body = await readBody(request);
    if (route === `POST ${DisconnectPath}`) {
      const asked = DisconnectRequest.safeParse(body);
      if (!asked.success) return { status: 400, body: done('That request was incomplete.') };
      return {
        status: 200,
        body: sessions.disconnect(asked.data.id) ? done() : done('That person had already signed out.'),
      };
    }
    if (route === `POST ${ServerPasswordPath}`) {
      const asked = ServerPasswordRequest.safeParse(body);
      if (!asked.success) return { status: 400, body: done('That request was incomplete.') };
      try {
        await serverPassword.set(asked.data.password, asked.data.again);
        return { status: 200, body: done() };
      } catch (error) {
        if (error instanceof Refusal) return { status: 200, body: done(error.message) };
        throw error;
      }
    }
    if (route === `POST ${ServerPasswordOffPath}`) {
      serverPassword.turnOff();
      return { status: 200, body: done() };
    }
    return { status: 404, body: done('Not found.') };
  }

  const listener = createServer((request: IncomingMessage, response: ServerResponse) => {
    answer(request)
      .catch((error: unknown) => {
        console.error('The dashboard asked for something that failed:', error);
        return { status: 500, body: done('Something went wrong in KVNsys Server. Its log says what.') };
      })
      .then(({ status, body }) => {
        response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
      });
  });
  // Only this PC. Port 0: Windows picks a free one, so nothing else on the PC can be in the way.
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const port = (listener.address() as AddressInfo).port;

  const file = join(options.dataDir, ControlFile);
  mkdirSync(options.dataDir, { recursive: true });
  writeFileSync(`${file}.tmp`, `${JSON.stringify({ port, key } satisfies ControlFileContents)}\n`, { mode: 0o600 });
  renameSync(`${file}.tmp`, file);

  const forgetKey = () => {
    // Only this run's file: a newer run may already have written its own.
    try {
      const written = ControlFileContents.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      if (written.success && written.data.key === key) rmSync(file, { force: true });
    } catch {
      // Already gone, or unreadable: either way it's not this run's to remove.
    }
  };

  return {
    port,
    forgetKey,
    close: async () => {
      forgetKey();
      listener.closeAllConnections();
      await new Promise((resolve) => listener.close(resolve));
    },
  };
}

function done(message?: string): ControlDone {
  return message === undefined ? { ok: true } : { ok: false, message };
}

/** True when the request shows this run's key. Compared in constant time. */
function showsKey(header: string | undefined, key: string): boolean {
  const shown = Buffer.from(/^Bearer (\S+)$/.exec(header ?? '')?.[1] ?? '');
  const expected = Buffer.from(key);
  return shown.length === expected.length && timingSafeEqual(shown, expected);
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MaxBody) request.destroy(new Error('The request was too big.'));
      else chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        resolve(undefined);
      }
    });
  });
}
