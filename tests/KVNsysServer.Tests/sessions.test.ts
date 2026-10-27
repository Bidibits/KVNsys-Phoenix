import { inspect } from 'node:util';
import { DisconnectedAtServer, SessionHours, Sessions, SignInEnded, type SignedInPerson } from '@kvnsys/server';
import { describe, expect, it } from 'vitest';

const ana: SignedInPerson = {
  id: '0192f3c1-0000-7000-8000-000000000001',
  username: 'ana',
  displayName: 'Ana Cruz',
  roleCode: 'MANAGER',
  rights: [],
};

/** A keeper whose clock the test moves by hand. */
function sessionsWithClock() {
  let now = new Date('2026-10-18T08:00:00Z');
  const sessions = new Sessions(() => now);
  return { sessions, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

const Hour = 60 * 60 * 1000;

describe('Sessions', () => {
  it('finds whose pass it is', () => {
    const { sessions } = sessionsWithClock();
    const { token } = sessions.start(ana);
    expect(sessions.find(token)?.user).toEqual(ana);
  });

  it('makes long, random passes, a different one every time', () => {
    const { sessions } = sessionsWithClock();
    const first = sessions.start(ana).token;
    const second = sessions.start(ana).token;
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it('knows nothing about a pass it never made', () => {
    const { sessions } = sessionsWithClock();
    sessions.start(ana);
    expect(sessions.find('made-up-made-up-made-up-made-up-made-up-mad')).toBeNull();
  });

  it(`keeps a pass good for ${SessionHours} hours, and not a moment longer`, () => {
    const { sessions, advance } = sessionsWithClock();
    const { token, expiresAt } = sessions.start(ana);
    expect(expiresAt).toEqual(new Date('2026-10-18T20:00:00Z'));
    advance(SessionHours * Hour - 1);
    expect(sessions.find(token)).not.toBeNull();
    advance(1);
    expect(sessions.find(token)).toBeNull();
  });

  it('cancels a pass, and cancelling it again is fine', () => {
    const { sessions } = sessionsWithClock();
    const kept = sessions.start(ana).token;
    const cancelled = sessions.start(ana).token;
    sessions.cancel(cancelled);
    sessions.cancel(cancelled);
    expect(sessions.find(cancelled)).toBeNull();
    expect(sessions.find(kept)).not.toBeNull();
  });

  it("ends every pass one person holds, on every register, and leaves everyone else's", () => {
    const { sessions } = sessionsWithClock();
    const first = sessions.start(ana).token;
    const second = sessions.start(ana).token;
    const ben = sessions.start({ ...ana, id: '0192f3c1-0000-7000-8000-000000000002', username: 'ben' }).token;
    expect(sessions.cancelFor(ana.id)).toBe(2);
    expect([sessions.find(first), sessions.find(second)]).toEqual([null, null]);
    expect(sessions.find(ben)).not.toBeNull();
    expect(sessions.cancelFor(ana.id)).toBe(0);
  });

  it('counts only the passes that are still good, and forgets the rest', () => {
    const { sessions, advance } = sessionsWithClock();
    sessions.start(ana);
    advance(11 * Hour);
    sessions.start(ana);
    expect(sessions.activeCount()).toBe(2);
    advance(1 * Hour);
    expect(sessions.activeCount()).toBe(1);
  });

  it("lists who's signed in, oldest first, without any pass, and forgets passes that have run out", () => {
    const { sessions, advance } = sessionsWithClock();
    const first = sessions.start(ana, { machineId: 'm1', locationId: 'l1', code: 'HQ-R01', name: 'Counter 1' });
    advance(Hour);
    sessions.start({ ...ana, id: '0192f3c1-0000-7000-8000-000000000002', username: 'ben' });
    const listed = sessions.list();
    expect(listed.map((session) => [session.user.username, session.register?.name ?? null])).toEqual([
      ['ana', 'Counter 1'],
      ['ben', null],
    ]);
    expect(new Set(listed.map((session) => session.id)).size).toBe(2);
    expect(JSON.stringify(listed)).not.toContain(first.token);
    advance(SessionHours * Hour - Hour);
    expect(sessions.list().map((session) => session.user.username)).toEqual(['ben']);
  });

  it('disconnects one sign-in by its id, and tells that register why at its next request', () => {
    const { sessions } = sessionsWithClock();
    const gone = sessions.start(ana).token;
    const kept = sessions.start(ana).token;
    const [goneSession] = sessions.list();
    expect(sessions.disconnect(goneSession!.id)).toBe(true);
    expect(sessions.find(gone)).toBeNull();
    expect(sessions.whyEnded(gone)).toBe(DisconnectedAtServer);
    expect(sessions.find(kept)).not.toBeNull();
    // Gone already: nothing more to do, and saying so.
    expect(sessions.disconnect(goneSession!.id)).toBe(false);
  });

  it('says a plain "ended" for a pass that was signed out, never made, or disconnected long enough ago to have expired', () => {
    const { sessions, advance } = sessionsWithClock();
    const signedOut = sessions.start(ana).token;
    sessions.cancel(signedOut);
    expect(sessions.whyEnded(signedOut)).toBe(SignInEnded);
    expect(sessions.whyEnded('made-up-made-up-made-up-made-up-made-up-mad')).toBe(SignInEnded);
    const disconnected = sessions.start(ana).token;
    sessions.disconnect(sessions.list()[0]!.id);
    advance(SessionHours * Hour);
    sessions.list(); // forgets what has run out
    expect(sessions.whyEnded(disconnected)).toBe(SignInEnded);
  });

  it('never holds a pass itself, only a scrambled copy that cannot be used as one', () => {
    const { sessions } = sessionsWithClock();
    const { token } = sessions.start(ana);
    expect(inspect(sessions, { depth: 10, showHidden: true })).not.toContain(token);
  });
});
