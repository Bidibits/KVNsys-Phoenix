import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsFile } from '../../src/KVNsysClientApp/dist/desktop/settings-file.js';
import { freshDataDir, removeDataDir } from './launch.js';

describe('SettingsFile', () => {
  let dir: string;
  let file: SettingsFile;

  beforeEach(() => {
    dir = freshDataDir();
    file = new SettingsFile(join(dir, 'nested', 'settings.json'));
  });

  afterEach(() => removeDataDir(dir));

  it('remembers nothing when there is no file yet', () => {
    expect(file.load()).toEqual({});
  });

  it('reads back what it saved, making the folder if needed', () => {
    file.save({ serverAddress: 'http://192.168.0.111:9000' });
    expect(file.load()).toEqual({ serverAddress: 'http://192.168.0.111:9000' });
  });

  it('leaves no half-written side file behind', () => {
    file.save({ serverAddress: 'http://192.168.0.111:9000' });
    expect(readdirSync(join(dir, 'nested'))).toEqual(['settings.json']);
  });

  it('treats a damaged file as "nothing remembered", instead of refusing to start', () => {
    file.save({ serverAddress: 'http://x:9000' });
    writeFileSync(file.path, '{ this is not json');
    expect(file.load()).toEqual({});
    writeFileSync(file.path, JSON.stringify({ serverAddress: 42 }));
    expect(file.load()).toEqual({});
  });

  it('can save again over a damaged file', () => {
    writeFileSync(join(dir, 'broken.json'), 'garbage');
    const broken = new SettingsFile(join(dir, 'broken.json'));
    broken.save({ serverAddress: 'http://x:9000' });
    expect(broken.load()).toEqual({ serverAddress: 'http://x:9000' });
    expect(existsSync(join(dir, 'broken.json.tmp'))).toBe(false);
  });
});
