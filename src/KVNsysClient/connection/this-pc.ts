import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import type { MachineIdentity } from '@kvnsys/wire';

/**
 * Who this PC is, for the server to know which machine a sign-in is at: its hardware id, which
 * survives renaming it (Windows' MachineGuid, or /etc/machine-id on Linux), and its computer name.
 * Null when the id can't be read: that PC then signs in at no machine. Reinstalling Windows
 * changes the id, and the PC is then recorded as a new machine.
 */
export function readThisPc(): MachineIdentity | null {
  const hardwareId = readHardwareId();
  return hardwareId ? { hardwareId, computerName: hostname() } : null;
}

function readHardwareId(): string | null {
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      return /MachineGuid\s+REG_SZ\s+(\S+)/.exec(output)?.[1] ?? null;
    }
    if (process.platform === 'linux') return readFileSync('/etc/machine-id', 'utf8').trim() || null;
    return null;
  } catch {
    return null;
  }
}
