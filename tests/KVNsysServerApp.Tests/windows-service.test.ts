import { describe, expect, it } from 'vitest';
import {
  actScript,
  lookScript,
  NeedsAdministrator,
  NotInstalled,
  readDone,
  readLook,
  runPowerShell,
  runsAsAdministrator,
  ServiceProblem,
  WindowsService,
} from '../../src/KVNsysServerApp/dist/desktop/windows-service.js';

/** PowerShell, played by the test: it records each script and prints what the test says Windows would. */
function fakePowerShell(...printed: string[]) {
  const scripts: string[] = [];
  return {
    scripts,
    run: async (script: string) => {
      scripts.push(script);
      return printed.shift() ?? '';
    },
  };
}

describe("reading Windows' answers about the server's service", () => {
  it.each([
    [4, 2, { state: 'running', startsWithPc: true }],
    [1, 3, { state: 'stopped', startsWithPc: false }],
    [2, 3, { state: 'starting', startsWithPc: false }],
    [3, 2, { state: 'stopping', startsWithPc: true }],
    // Disabled, by someone in Windows' own tools: not starting with the PC.
    [1, 4, { state: 'stopped', startsWithPc: false }],
  ])('reads status %i with start type %i', (status, startType, look) => {
    expect(readLook(JSON.stringify({ installed: true, status, startType }))).toEqual(look);
  });

  it('knows when the service is not installed at all', () => {
    expect(readLook('{"installed":false}\r\n')).toEqual({ state: 'not-installed', startsWithPc: false });
  });

  it("says so, rather than guessing, when the answer makes no sense", () => {
    expect(() => readLook('')).toThrow(ServiceProblem);
    expect(() => readLook('{"installed":true}')).toThrow(ServiceProblem);
  });

  it('takes "ok" as done', () => {
    expect(() => readDone('{"ok":true}\r\n', 'start')).not.toThrow();
  });

  it('turns Windows’ error numbers into what to do', () => {
    expect(() => readDone('{"ok":false,"code":5,"message":"Access is denied"}', 'stop')).toThrow(NeedsAdministrator);
    expect(() => readDone('{"ok":false,"code":1060,"message":"x"}', 'start')).toThrow(NotInstalled);
  });

  it('passes on what Windows said otherwise, and points at the logs when the server will not start', () => {
    expect(() => readDone('{"ok":false,"code":1053,"message":"The service did not respond."}', 'start')).toThrow(
      "KVNsys Server didn't start. Windows said: The service did not respond. Open the logs folder to see why.",
    );
    expect(() => readDone('{"ok":false,"code":null,"message":"Something else."}', 'stop')).toThrow(
      "KVNsys Server didn't turn off. Windows said: Something else.",
    );
  });
});

describe('the scripts, run by the real PowerShell on this PC (asking only, changing nothing)', () => {
  // Reading the scripts' text once missed a syntax error that stopped the dashboard on its first real run.
  it('reads the service, whether or not this PC has it installed', async () => {
    const look = readLook(await runPowerShell(lookScript()));
    expect(['running', 'stopped', 'starting', 'stopping', 'not-installed']).toContain(look.state);
  });

  it('can tell whether this window has administrator rights', async () => {
    expect(typeof (await runsAsAdministrator())).toBe('boolean');
    expect(await runsAsAdministrator(fakePowerShell('True\r\n').run)).toBe(true);
    expect(await runsAsAdministrator(fakePowerShell('False\r\n').run)).toBe(false);
  });

  it('reports a command that worked, and one that failed with its reason', async () => {
    expect(() => readDone('', 'start')).toThrow(ServiceProblem);
    readDone(await runPowerShell(actScript('$null = Get-Date')), 'change');
    const failed = await runPowerShell(actScript("Get-Service -Name 'kvnsys-no-such-service' -ErrorAction Stop"));
    expect(JSON.parse(failed)).toMatchObject({ ok: false, message: expect.stringContaining('kvnsys-no-such-service') });
  });
});

describe('the scripts sent to PowerShell', () => {
  it('ask for numbers, never words, so a Windows in another language reads the same', () => {
    expect(lookScript()).toContain('[int]$s.Status');
    expect(lookScript()).toContain('[int]$s.StartType');
    expect(actScript('Start-Service x')).toContain('NativeErrorCode');
  });

  it('turn the service on and off, and switch it between starting with the PC and starting only when asked', async () => {
    const powerShell = fakePowerShell('{"ok":true}', '{"ok":true}', '{"ok":true}', '{"ok":true}');
    const service = new WindowsService(powerShell.run);
    await service.start();
    await service.stop();
    await service.setStartsWithPc(true);
    await service.setStartsWithPc(false);
    expect(powerShell.scripts.map((script) => /try \{ ([^;]+);/.exec(script)?.[1])).toEqual([
      "Start-Service -Name 'kvnsys-server' -ErrorAction Stop",
      "Stop-Service -Name 'kvnsys-server' -ErrorAction Stop",
      "Set-Service -Name 'kvnsys-server' -StartupType Automatic -ErrorAction Stop",
      "Set-Service -Name 'kvnsys-server' -StartupType Manual -ErrorAction Stop",
    ]);
  });
});
