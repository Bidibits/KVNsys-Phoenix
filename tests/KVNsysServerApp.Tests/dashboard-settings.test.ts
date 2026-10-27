import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DashboardSettingsFile, loadDashboardSettings, saveDashboardSettings } from '../../src/KVNsysServerApp/dist/desktop/dashboard-settings.js';
import { freshDir, removeDir } from './launch.js';

describe("the dashboard's settings", () => {
  let dir: string;
  beforeEach(() => {
    dir = freshDir();
  });
  afterEach(() => removeDir(dir));

  it('leaves the server running when the window closes, unless someone chose otherwise', () => {
    expect(loadDashboardSettings(dir)).toEqual({ stopServerOnClose: false });
  });

  it('keeps the choice, in the server’s own folder, with no side file left behind', () => {
    saveDashboardSettings(dir, { stopServerOnClose: true });
    expect(loadDashboardSettings(dir)).toEqual({ stopServerOnClose: true });
    expect(readdirSync(dir)).toEqual([DashboardSettingsFile]);
  });

  it('takes a damaged file as the defaults', () => {
    writeFileSync(join(dir, DashboardSettingsFile), '{ not json');
    expect(loadDashboardSettings(dir)).toEqual({ stopServerOnClose: false });
    writeFileSync(join(dir, DashboardSettingsFile), JSON.stringify({ stopServerOnClose: 'yes' }));
    expect(loadDashboardSettings(dir)).toEqual({ stopServerOnClose: false });
  });
});
