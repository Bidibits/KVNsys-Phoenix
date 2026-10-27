import { SignInPath, SignInReply, type RegisterIdentity, type SessionPass, type SignedInUser } from '@kvnsys/wire';
import { describeTransportFailure, type TransportProblem } from '../connection/failures.js';
import { requestJson, type ServerPin } from '../connection/secure-request.js';

/** 'server-password': the server password was missing or wrong (it may have changed), not the person's. */
export type SignInProblem = 'refused' | 'server-password' | 'not-connected' | TransportProblem;

/** Yes comes with a pass: proof of who's signed in, for later requests. Keep it on the desktop side. */
export type SignInResult =
  | { ok: true; user: SignedInUser; session: SessionPass }
  | { ok: false; reason: SignInProblem; message: string };

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
  /**
   * `register`: this PC, so the sign-in is at a register (readThisPc). Left out, it's at none.
   * `serverPassword`: for a server that has one.
   */
  options: { pin: ServerPin | null; timeoutMs?: number; register?: RegisterIdentity | null; serverPassword?: string | null },
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
    const body = {
      ...credentials,
      ...(options.register ? { register: options.register } : {}),
      ...(options.serverPassword ? { serverPassword: options.serverPassword } : {}),
    };
    response = await requestJson({ address, path: SignInPath, method: 'POST', body, pin: options.pin, timeoutMs });
  } catch (error) {
    return { ok: false, ...describeTransportFailure(error, address, timeoutMs) };
  }

  const reply = SignInReply.safeParse(response.body);
  if (!reply.success) {
    return { ok: false, reason: 'not-kvnsys', message: `The server at ${address} gave an answer this app doesn't understand.` };
  }
  if (reply.data.signedIn) return { ok: true, user: reply.data.user, session: reply.data.session };
  return { ok: false, reason: reply.data.serverPassword ? 'server-password' : 'refused', message: reply.data.message };
}
