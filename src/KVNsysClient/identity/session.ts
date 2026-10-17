import { SessionPath, SessionReply, SignOutPath, SignOutReply, type SessionPass, type SignedInUser } from '@kvnsys/wire';
import { describeTransportFailure, type TransportProblem } from '../connection/failures.js';
import { requestJson, type ServerPin } from '../connection/secure-request.js';

export type SessionProblem = 'ended' | 'not-connected' | TransportProblem;

export type SessionCheck =
  | { ok: true; user: SignedInUser; expiresAt: string }
  | { ok: false; reason: SessionProblem; message: string };

export type SignOutResult = { ok: true } | { ok: false; reason: 'not-connected' | TransportProblem; message: string };

const DefaultTimeoutMs = 5000;

/** Asks the server whether this pass is still good, and whose it is. */
export async function checkSession(
  address: string,
  pass: SessionPass,
  options: { pin: ServerPin | null; timeoutMs?: number },
): Promise<SessionCheck> {
  if (!options.pin) return notConnected();
  const timeoutMs = options.timeoutMs ?? DefaultTimeoutMs;
  let response;
  try {
    response = await requestJson({ address, path: SessionPath, pass: pass.token, pin: options.pin, timeoutMs });
  } catch (error) {
    return { ok: false, ...describeTransportFailure(error, address, timeoutMs) };
  }
  const reply = SessionReply.safeParse(response.body);
  if (!reply.success) return notUnderstood(address);
  return reply.data.signedIn
    ? { ok: true, user: reply.data.user, expiresAt: reply.data.expiresAt }
    : { ok: false, reason: 'ended', message: reply.data.message };
}

/** Hands the pass back, so the server cancels it and it can't be used again. */
export async function signOut(
  address: string,
  pass: SessionPass,
  options: { pin: ServerPin | null; timeoutMs?: number },
): Promise<SignOutResult> {
  if (!options.pin) return notConnected();
  const timeoutMs = options.timeoutMs ?? DefaultTimeoutMs;
  let response;
  try {
    response = await requestJson({ address, path: SignOutPath, method: 'POST', pass: pass.token, pin: options.pin, timeoutMs });
  } catch (error) {
    return { ok: false, ...describeTransportFailure(error, address, timeoutMs) };
  }
  return SignOutReply.safeParse(response.body).success ? { ok: true } : notUnderstood(address);
}

function notConnected() {
  return {
    ok: false,
    reason: 'not-connected',
    message: "This register hasn't connected to that server securely, so it won't show it a pass. Connect first.",
  } as const;
}

function notUnderstood(address: string) {
  return { ok: false, reason: 'not-kvnsys', message: `The server at ${address} gave an answer this app doesn't understand.` } as const;
}
