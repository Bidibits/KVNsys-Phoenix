import { homedir } from 'node:os';
import { join } from 'node:path';

// The server's own folder holds a handful of files. Their names live here, in a file that loads
// nothing heavy, so the server's dashboard can find them without bringing the server along.

/** The server's private key. Never leaves this PC. */
export const ServerKeyFile = 'server-key.pem';
/** The server's certificate, which every register pins. */
export const ServerCertificateFile = 'server-certificate.pem';
/** The server's settings, written like a .env file. */
export const ServerSettingsFile = 'server.env';
/** Where a running server tells its dashboard how to reach it, and the key that proves who's asking. */
export const ControlFile = 'control.json';
/** The server password's scrambled copy, when the server has one. */
export const ServerPasswordFile = 'server-password.json';

/**
 * Where the server keeps its own files when KVNSYS_SERVER_DATA doesn't say otherwise. On Windows
 * it's machine-wide, C:\ProgramData\KVNsys\Server: a server belongs to the PC, not to whoever is
 * signed in, and it has to be found in the same place once it runs as a Windows service.
 */
export function defaultServerDataDir(): string {
  return process.platform === 'win32'
    ? join(process.env.ProgramData ?? 'C:\\ProgramData', 'KVNsys', 'Server')
    : join(homedir(), '.kvnsys', 'server');
}

/** Where earlier versions kept them on Windows: the signed-in account's own folder. */
export function earlierServerDataDir(): string | null {
  return process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'KVNsys', 'Server')
    : null;
}

/** The folder this server uses: KVNSYS_SERVER_DATA when it's set, or the usual one. */
export function serverDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.KVNSYS_SERVER_DATA || defaultServerDataDir();
}
