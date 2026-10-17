import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';

/**
 * Who the server PC is. Unlike a browser, the server can ask its own operating system:
 * the computer name, and a hardware id that survives renaming it (Windows MachineGuid,
 * or /etc/machine-id on Linux). Reinstalling the OS changes the id.
 */
export function readServerIdentity(): { hardwareId: string | null; computerName: string } {
  return { hardwareId: readHardwareId(), computerName: hostname() };
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
    if (process.platform === 'linux') {
      return readFileSync('/etc/machine-id', 'utf8').trim() || null;
    }
    return null;
  } catch {
    // No id is fine: the server machine is then found again by its code.
    return null;
  }
}
