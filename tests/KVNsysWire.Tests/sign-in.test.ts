import { ProtocolVersion, SignInPath, SignInReply, SignInRequest } from '@kvnsys/wire';
import { describe, expect, it } from 'vitest';

describe('the sign-in call', () => {
  it('lives at /api/sign-in, and came with protocol 2', () => {
    expect(SignInPath).toBe('/api/sign-in');
    expect(ProtocolVersion).toBe(2);
  });

  it('needs a username and a password, and trims the username', () => {
    expect(SignInRequest.parse({ username: '  admin ', password: 'x' }).username).toBe('admin');
    expect(SignInRequest.safeParse({ username: '', password: 'x' }).success).toBe(false);
    expect(SignInRequest.safeParse({ username: 'admin', password: '' }).success).toBe(false);
    expect(SignInRequest.safeParse({ username: 'admin' }).success).toBe(false);
  });

  it('answers yes with who it is, or no with a message', () => {
    const yes = { signedIn: true, user: { username: 'admin', displayName: 'System Administrator', roleCode: 'ADMIN' } };
    expect(SignInReply.safeParse(yes).success).toBe(true);
    expect(SignInReply.safeParse({ signedIn: false, message: 'Wrong username or password.' }).success).toBe(true);
    expect(SignInReply.safeParse({ signedIn: true }).success).toBe(false);
  });
});
