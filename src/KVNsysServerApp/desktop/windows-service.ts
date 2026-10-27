import { execFile } from 'node:child_process';
import type { ServiceLook, ServiceState } from './service-state.js';

export type { ServiceLook, ServiceState } from './service-state.js';

/** The Windows service the server's setup installs. */
export const ServerServiceName = 'kvnsys-server';

/** Windows turned a request down. The message says why, in words for the person at the dashboard. */
export class ServiceProblem extends Error {
  override name = 'ServiceProblem';
}

/** Turning the server on and off, and whether it starts with the PC. */
export interface ServiceControl {
  look(): Promise<ServiceLook>;
  start(): Promise<void>;
  stop(): Promise<void>;
  setStartsWithPc(on: boolean): Promise<void>;
}

export const NeedsAdministrator = 'Windows needs administrator rights for that. Close this window and open KVNsys Server again, as an administrator.';
export const NotInstalled = "KVNsys Server isn't installed as a Windows service on this PC. Run KVNsys Server Setup.";

/** Runs a PowerShell script and hands back what it printed. */
export type PowerShell = (script: string) => Promise<string>;

export const runPowerShell: PowerShell = (script) =>
  new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      // Turning a server off can take a while: it finishes what it's doing first.
      { windowsHide: true, timeout: 90_000 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });

/**
 * The real thing: asks Windows' service manager through PowerShell. Every answer comes back as
 * JSON with numbers, never as text, so a Windows in another language reads the same.
 */
export class WindowsService implements ServiceControl {
  constructor(private readonly powerShell: PowerShell = runPowerShell) {}

  async look(): Promise<ServiceLook> {
    return readLook(await this.powerShell(lookScript()));
  }

  async start(): Promise<void> {
    readDone(await this.powerShell(actScript(`Start-Service -Name '${ServerServiceName}' -ErrorAction Stop`)), 'start');
  }

  async stop(): Promise<void> {
    readDone(await this.powerShell(actScript(`Stop-Service -Name '${ServerServiceName}' -ErrorAction Stop`)), 'stop');
  }

  async setStartsWithPc(on: boolean): Promise<void> {
    const startup = on ? 'Automatic' : 'Manual';
    readDone(await this.powerShell(actScript(`Set-Service -Name '${ServerServiceName}' -StartupType ${startup} -ErrorAction Stop`)), 'change');
  }
}

/**
 * Whether this window runs with administrator rights. Its icons ask Windows for them; opened some
 * other way, it may not have them, and then Windows refuses to turn the server on or off.
 */
export async function runsAsAdministrator(powerShell: PowerShell = runPowerShell): Promise<boolean> {
  const printed = await powerShell(
    '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
  );
  // PowerShell prints True or False in English whatever the Windows language.
  return printed.trim() === 'True';
}

/** A script that prints the service's state and start type as numbers, or that it isn't there. */
export function lookScript(): string {
  return [
    `$s = Get-Service -Name '${ServerServiceName}' -ErrorAction SilentlyContinue`,
    // The else stays on the if's line: a ";" before it is a PowerShell error.
    `if (-not $s) { '{"installed":false}' } else { [pscustomobject]@{ installed = $true; status = [int]$s.Status; startType = [int]$s.StartType } | ConvertTo-Json -Compress }`,
  ].join('\n');
}

/** A script that runs `command` and prints whether it worked, with Windows' own error number if it didn't. */
export function actScript(command: string): string {
  return [
    `try { ${command}; '{"ok":true}' }`,
    'catch {',
    '  $code = $null; $inner = $_.Exception',
    '  while ($inner) { if ($inner -is [System.ComponentModel.Win32Exception]) { $code = $inner.NativeErrorCode }; $inner = $inner.InnerException }',
    '  [pscustomobject]@{ ok = $false; code = $code; message = $_.Exception.Message } | ConvertTo-Json -Compress',
    '}',
  ].join('\n');
}

// .NET's ServiceControllerStatus and ServiceStartMode, by number.
const States: Record<number, ServiceState> = { 1: 'stopped', 2: 'starting', 3: 'stopping', 4: 'running' };
const Automatic = 2;

/** What lookScript printed, as a look at the service. */
export function readLook(printed: string): ServiceLook {
  const answer = parse(printed) as { installed?: unknown; status?: unknown; startType?: unknown } | null;
  if (answer?.installed === false) return { state: 'not-installed', startsWithPc: false };
  if (answer?.installed !== true || typeof answer.status !== 'number' || typeof answer.startType !== 'number') {
    throw new ServiceProblem("Windows gave an answer about KVNsys Server this window doesn't understand.");
  }
  // Paused and its kin don't happen to KVNsys Server; if they ever do, it isn't serving.
  return { state: States[answer.status] ?? 'stopped', startsWithPc: answer.startType === Automatic };
}

/** What actScript printed: nothing if it worked, or the reason as a ServiceProblem. */
export function readDone(printed: string, what: 'start' | 'stop' | 'change'): void {
  const answer = parse(printed) as { ok?: unknown; code?: unknown; message?: unknown } | null;
  if (answer?.ok === true) return;
  // 5: access denied. 1060: no such service.
  if (answer?.code === 5) throw new ServiceProblem(NeedsAdministrator);
  if (answer?.code === 1060) throw new ServiceProblem(NotInstalled);
  const detail = typeof answer?.message === 'string' ? ` Windows said: ${answer.message}` : '';
  const failed = { start: "KVNsys Server didn't start.", stop: "KVNsys Server didn't turn off.", change: "Windows didn't change KVNsys Server's settings." }[what];
  const advice = what === 'start' ? ' Open the logs folder to see why.' : '';
  throw new ServiceProblem(`${failed}${detail}${advice}`);
}

function parse(printed: string): unknown {
  try {
    return JSON.parse(printed.trim());
  } catch {
    return null;
  }
}
