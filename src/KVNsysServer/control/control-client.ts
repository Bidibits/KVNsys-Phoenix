import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import type { z } from 'zod';
import { DefaultPort } from '@kvnsys/wire';
import { ControlFile } from '../setup/server-folder.js';
import { loadServerSettings } from '../setup/server-settings.js';
import {
  ControlDone,
  ControlFileContents,
  DisconnectPath,
  ServerPasswordOffPath,
  ServerPasswordPath,
  ServerStatus,
  StatusPath,
} from './control-shapes.js';

/**
 * Why the dashboard couldn't get an answer: the server isn't running, this window may not read the
 * server's folder, the server turned the request down, or the answer made no sense.
 */
export type ControlProblem = 'off' | 'no-access' | 'refused' | 'broken';

export type ControlAnswer<T> = { ok: true; value: T } | { ok: false; reason: ControlProblem; message: string };

export const ServerIsOff = "KVNsys Server isn't running.";
export const NoAccess = "This window can't read KVNsys Server's folder. Open KVNsys Server as an administrator.";

/** A server on the same PC answers in milliseconds, unless it's starting or very busy. */
const TimeoutMs = 3000;

/** How the server in `dataDir` is doing, and who's connected to it. */
export function serverStatus(dataDir: string): Promise<ControlAnswer<ServerStatus>> {
  return ask(dataDir, 'GET', StatusPath, undefined, ServerStatus);
}

/** Ends one person's sign-in. They find out at their register's next request. */
export function disconnectPerson(dataDir: string, id: string): Promise<ControlAnswer<true>> {
  return done(ask(dataDir, 'POST', DisconnectPath, { id }, ControlDone));
}

/** Gives the server a new password, typed twice. Registers must give it before anyone can sign in. */
export function setServerPassword(dataDir: string, password: string, again: string): Promise<ControlAnswer<true>> {
  return done(ask(dataDir, 'POST', ServerPasswordPath, { password, again }, ControlDone));
}

/** Lets registers sign in without the server password again. */
export function turnOffServerPassword(dataDir: string): Promise<ControlAnswer<true>> {
  return done(ask(dataDir, 'POST', ServerPasswordOffPath, {}, ControlDone));
}

/** The port registers reach the server on, from its settings: what it will use when it's turned on. */
export function configuredPort(dataDir: string): number {
  const settings: NodeJS.ProcessEnv = {};
  try {
    loadServerSettings(dataDir, settings);
  } catch {
    // Unreadable settings: the server would use its usual port, unless it can't start at all.
  }
  const port = Number(settings.KVNSYS_PORT ?? DefaultPort);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DefaultPort;
}

async function done(answer: Promise<ControlAnswer<ControlDone>>): Promise<ControlAnswer<true>> {
  const result = await answer;
  if (!result.ok) return result;
  return result.value.ok ? { ok: true, value: true } : { ok: false, reason: 'refused', message: result.value.message };
}

/** Where this run of the server answers, and its key, from the file it wrote. */
function readControlFile(dataDir: string): ControlAnswer<ControlFileContents> {
  let text: string;
  try {
    text = readFileSync(join(dataDir, ControlFile), 'utf8');
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'EACCES' || code === 'EPERM') return { ok: false, reason: 'no-access', message: NoAccess };
    return { ok: false, reason: 'off', message: ServerIsOff };
  }
  try {
    const contents = ControlFileContents.safeParse(JSON.parse(text));
    if (contents.success) return { ok: true, value: contents.data };
  } catch {
    // Half-written, or not ours: the server isn't reachable through it.
  }
  return { ok: false, reason: 'off', message: ServerIsOff };
}

function ask<T>(
  dataDir: string,
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  shape: z.ZodType<T>,
): Promise<ControlAnswer<T>> {
  const found = readControlFile(dataDir);
  if (!found.ok) return Promise.resolve(found);
  const { port, key } = found.value;
  const payload = body === undefined ? undefined : JSON.stringify(body);

  return new Promise((resolve) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      method,
      timeout: TimeoutMs,
      agent: false,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    // Nothing listening: the file is left from a run that has ended.
    req.on('error', () => resolve({ ok: false, reason: 'off', message: ServerIsOff }));
    req.on('response', (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('error', () => resolve({ ok: false, reason: 'off', message: ServerIsOff }));
      res.on('end', () => {
        if (res.statusCode === 401) {
          // Another program on the port the file names: the run that wrote it has ended.
          resolve({ ok: false, reason: 'off', message: ServerIsOff });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          parsed = undefined;
        }
        const value = shape.safeParse(parsed);
        resolve(
          value.success
            ? { ok: true, value: value.data }
            : { ok: false, reason: 'broken', message: "KVNsys Server gave an answer this window doesn't understand. Are both from the same update?" },
        );
      });
    });
    req.end(payload);
  });
}
