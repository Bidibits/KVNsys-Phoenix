import { SignInPath, SignInReply, type SignedInUser } from '@kvnsys/wire';
import { describeTransportFailure, type TransportProblem } from '../connection/failures.js';
import { requestJson, type ServerPin } from '../connection/secure-request.js';

export type SignInProblem = 'refused' | 'not-connected' | TransportProblem;

export type SignInResult = { ok: true; user: SignedInUser } | { ok: false; reason: SignInProblem; message: string };

const DefaultTimeoutMs = 5000;

/**
 * Asks the server whether this username and password are right.
 *
 * The password is only ever sent to a server this register already trusts, one whose certificate
 * it has pinned. Never on a first contact, and never to a server presenting any other certificate:
 * that's refused during the handshake, before the password leaves this PC.
 */
export async function signIn(
  address: string,
  credentials: { username: string; password: string },
  options: { pin: ServerPin | null; timeoutMs?: number },
): Promise<SignInResult> {
  if (!options.pin) {
    return {
      ok: false,
      reason: 'not-connected',
      message: "This register hasn't connected to that server securely yet, so it won't send a password there. Connect first.",
    };
  }
  if (!credentials.username.trim() || !credentials.password) {
    return { ok: false, reason: 'refused', message: 'Type a username and a password.' };
  }

  const timeoutMs = options.timeoutMs ?? DefaultTimeoutMs;
  let response;
  try {
    response = await requestJson({ address, path: SignInPath, method: 'POST', body: credentials, pin: options.pin, timeoutMs });
  } catch (error) {
    return { ok: false, ...describeTransportFailure(error, address, timeoutMs) };
  }

  const reply = SignInReply.safeParse(response.body);
  if (!reply.success) {
    return { ok: false, reason: 'not-kvnsys', message: `The server at ${address} gave an answer this app doesn't understand.` };
  }
  return reply.data.signedIn ? { ok: true, user: reply.data.user } : { ok: false, reason: 'refused', message: reply.data.message };
}
