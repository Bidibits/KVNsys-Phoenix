import { Refusal } from '@kvnsys/core';
import { ProblemReply, type SessionPass } from '@kvnsys/wire';
import { describeTransportFailure, type TransportProblem } from './failures.js';
import { requestJson, type ServerPin } from './secure-request.js';

/**
 * Why a call that needs a pass didn't work:
 * - refused: the server said no to what was sent (a rule, or something already taken), with why
 * - ended: the sign-in has ended; sign in again
 * - not-allowed: signed in, but the role may not
 * - not-found: no such record
 * - server-error: the server broke while handling it; its log says why
 */
export type CallProblem = 'refused' | 'ended' | 'not-allowed' | 'not-found' | 'server-error' | 'not-connected' | TransportProblem;

export type Refused = { ok: false; reason: CallProblem; message: string };
export type Answer<T> = { ok: true; reply: T } | Refused;

export interface CallOptions {
  pin: ServerPin | null;
  timeoutMs?: number;
}

/** One of KVNsysWire's reply shapes. */
export interface Shape<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

const DefaultTimeoutMs = 5000;

/** Mistakes caught here, before anything is sent, come back as the same kind of answer as the server's. */
export function readOrRefuse<T>(read: () => T): { ok: true; value: T } | Refused {
  try {
    return { ok: true, value: read() };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, reason: 'refused', message: error.message };
    throw error;
  }
}

/**
 * One call that shows the signed-in pass. The pass only ever goes to a pinned server, and every
 * answer that isn't the expected reply comes back as a reason in words.
 */
export async function callServer<T>(
  address: string,
  pass: SessionPass,
  options: CallOptions,
  request: { path: string; method?: 'GET' | 'POST' | 'PUT'; body?: unknown },
  shape: Shape<T>,
): Promise<Answer<T>> {
  if (!options.pin) {
    return {
      ok: false,
      reason: 'not-connected',
      message: "This register hasn't connected to that server securely, so it won't show it a pass. Connect first.",
    };
  }
  const timeoutMs = options.timeoutMs ?? DefaultTimeoutMs;
  let response;
  try {
    response = await requestJson({ address, ...request, pass: pass.token, pin: options.pin, timeoutMs });
  } catch (error) {
    return { ok: false, ...describeTransportFailure(error, address, timeoutMs) };
  }

  if (response.status === 200 || response.status === 201) {
    const reply = shape.safeParse(response.body);
    if (reply.success) return { ok: true, reply: reply.data };
  } else if (response.status >= 500 && response.status !== 503) {
    return {
      ok: false,
      reason: 'server-error',
      message: `The server at ${address} ran into a problem with that. Try again; if it keeps happening, its log says why.`,
    };
  } else {
    const problem = ProblemReply.safeParse(response.body);
    const reason = ({ 400: 'refused', 401: 'ended', 403: 'not-allowed', 404: 'not-found', 409: 'refused', 503: 'refused' } as const)[
      response.status as 400 | 401 | 403 | 404 | 409 | 503
    ];
    if (problem.success && reason) return { ok: false, reason, message: problem.data.message };
  }
  return { ok: false, reason: 'not-kvnsys', message: `The server at ${address} gave an answer this app doesn't understand.` };
}
