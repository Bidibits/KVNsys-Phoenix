import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Refusal } from '@kvnsys/core';
import {
  DamagedServerPassword,
  NeedsServerPassword,
  ScryptPasswordHasher,
  ServerPassword,
  ServerPasswordFile,
  WrongServerPassword,
} from '@kvnsys/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const hasher = new ScryptPasswordHasher();

describe('ServerPassword', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kvnsys-server-password-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('starts off, so a new install lets any register connect', async () => {
    for (const password of [new ServerPassword(dir, hasher), new ServerPassword(null, hasher)]) {
      expect(password.state()).toBe('off');
      expect(await password.check(undefined)).toBeNull();
      expect(await password.check('anything')).toBeNull();
    }
  });

  it('once set, lets in the right password only, and says what was wrong', async () => {
    const password = new ServerPassword(dir, hasher);
    await password.set('shop-door-1234', 'shop-door-1234');
    expect(password.state()).toBe('on');
    expect(await password.check('shop-door-1234')).toBeNull();
    expect(await password.check('shop-door-9999')).toBe(WrongServerPassword);
    expect(await password.check(undefined)).toBe(NeedsServerPassword);
    expect(await password.check('')).toBe(NeedsServerPassword);
  });

  it('keeps it through a restart, as a scrambled copy only', async () => {
    await new ServerPassword(dir, hasher).set('shop-door-1234', 'shop-door-1234');
    const file = readFileSync(join(dir, ServerPasswordFile), 'utf8');
    expect(file).not.toContain('shop-door-1234');
    const afterRestart = new ServerPassword(dir, hasher);
    expect(afterRestart.state()).toBe('on');
    expect(await afterRestart.check('shop-door-1234')).toBeNull();
  });

  it('turns off for good: the file goes, and a restart finds it off', async () => {
    const password = new ServerPassword(dir, hasher);
    await password.set('shop-door-1234', 'shop-door-1234');
    password.turnOff();
    expect(password.state()).toBe('off');
    expect(existsSync(join(dir, ServerPasswordFile))).toBe(false);
    expect(new ServerPassword(dir, hasher).state()).toBe('off');
  });

  it('holds a new password to the same rule as an account: 8 characters, typed the same twice', async () => {
    const password = new ServerPassword(dir, hasher);
    await expect(password.set('short', 'short')).rejects.toThrow(Refusal);
    await expect(password.set('shop-door-1234', 'shop-door-1235')).rejects.toThrow(/didn't match/);
    expect(password.state()).toBe('off');
  });

  it.each([
    ['not JSON at all', 'garbage'],
    ['JSON without a scrambled password', '{"hash": "plain-text"}'],
  ])('refuses everyone, rather than letting anyone in, when the file is %s', async (_, contents) => {
    writeFileSync(join(dir, ServerPasswordFile), contents);
    const password = new ServerPassword(dir, hasher);
    expect(password.state()).toBe('damaged');
    expect(await password.check(undefined)).toBe(DamagedServerPassword);
    expect(await password.check('plain-text')).toBe(DamagedServerPassword);
    // Setting a new one mends it.
    await password.set('shop-door-1234', 'shop-door-1234');
    expect(await password.check('shop-door-1234')).toBeNull();
  });

  it('refuses everyone when the file is there but cannot be read', async () => {
    mkdirSync(join(dir, ServerPasswordFile));
    expect(new ServerPassword(dir, hasher).state()).toBe('damaged');
  });
});
