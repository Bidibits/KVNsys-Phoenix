import { inspect } from 'node:util';
import { SessionHours, Sessions, type SignedInPerson } from '@kvnsys/server';
import { describe, expect, it } from 'vitest';

const ana: SignedInPerson = {
  id: '0192f3c1-0000-7000-8000-000000000001',
  username: 'ana',
  displayName: 'Ana Cruz',
  roleCode: 'MANAGER',
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

  it('counts only the passes that are still good, and forgets the rest', () => {
    const { sessions, advance } = sessionsWithClock();
    sessions.start(ana);
    advance(11 * Hour);
    sessions.start(ana);
    expect(sessions.activeCount()).toBe(2);
    advance(1 * Hour);
    expect(sessions.activeCount()).toBe(1);
  });

  it('never holds a pass itself, only a scrambled copy that cannot be used as one', () => {
    const { sessions } = sessionsWithClock();
    const { token } = sessions.start(ana);
    expect(inspect(sessions, { depth: 10, showHidden: true })).not.toContain(token);
  });
});
