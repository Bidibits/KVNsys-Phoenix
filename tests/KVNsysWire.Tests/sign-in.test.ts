import {
  ProtocolVersion,
  SessionPass,
  SessionPath,
  SessionReply,
  SignInPath,
  SignInReply,
  SignInRequest,
  SignOutPath,
  SignOutReply,
} from '@kvnsys/wire';
import { describe, expect, it } from 'vitest';

const user = { username: 'admin', displayName: 'System Administrator', roleCode: 'ADMIN', rights: ['products.view'] };
const session = { token: 'p'.repeat(43), expiresAt: '2026-10-18T20:00:00.000Z' };

describe('the sign-in call', () => {
  // The rule, not today's number: the protocol was raised when sign-in arrived, and only goes up.
  it('lives at /api/sign-in, and came with protocol 2', () => {
    expect(SignInPath).toBe('/api/sign-in');
    expect(ProtocolVersion).toBeGreaterThanOrEqual(2);
  });

  it('needs a username and a password, and trims the username', () => {
    expect(SignInRequest.parse({ username: '  admin ', password: 'x' }).username).toBe('admin');
    expect(SignInRequest.safeParse({ username: '', password: 'x' }).success).toBe(false);
    expect(SignInRequest.safeParse({ username: 'admin', password: '' }).success).toBe(false);
    expect(SignInRequest.safeParse({ username: 'admin' }).success).toBe(false);
  });

  it('answers yes with who it is and a pass, or no with a message', () => {
    expect(SignInReply.safeParse({ signedIn: true, user, session }).success).toBe(true);
    expect(SignInReply.safeParse({ signedIn: false, message: 'Wrong username or password.' }).success).toBe(true);
    expect(SignInReply.safeParse({ signedIn: true }).success).toBe(false);
    // A yes without a pass would leave the register with no way to prove who's signed in.
    expect(SignInReply.safeParse({ signedIn: true, user }).success).toBe(false);
  });
});

describe('sessions', () => {
  it('live at /api/session and /api/sign-out, and came with protocol 3', () => {
    expect(SessionPath).toBe('/api/session');
    expect(SignOutPath).toBe('/api/sign-out');
    expect(ProtocolVersion).toBeGreaterThanOrEqual(3);
  });

  it('turn down a pass too short to be a real one', () => {
    expect(SessionPass.safeParse(session).success).toBe(true);
    expect(SessionPass.safeParse({ ...session, token: 'short' }).success).toBe(false);
  });

  it('say whose pass it is, or that the sign-in has ended', () => {
    expect(SessionReply.safeParse({ signedIn: true, user, expiresAt: session.expiresAt }).success).toBe(true);
    expect(SessionReply.safeParse({ signedIn: false, message: 'Your sign-in has ended. Sign in again.' }).success).toBe(true);
    expect(SessionReply.safeParse({ signedIn: true, user }).success).toBe(false);
  });

  it('confirm a sign-out', () => {
    expect(SignOutReply.safeParse({ signedOut: true }).success).toBe(true);
    expect(SignOutReply.safeParse({}).success).toBe(false);
  });
});
