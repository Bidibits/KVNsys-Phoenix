import 'reflect-metadata'; // @peculiar/x509 builds on tsyringe, which needs it loaded first.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import { randomBytes, webcrypto, X509Certificate } from 'node:crypto';
import * as x509 from '@peculiar/x509';

x509.cryptoProvider.set(webcrypto as unknown as Crypto);

/** This server's identity for secure connections: a private key and the certificate that goes with it. */
export interface ServerCertificate {
  /** PEM. Never leaves this PC. */
  key: string;
  /** PEM. Sent to every register that connects. */
  cert: string;
  /** What a register remembers and checks every time: "AB:CD:…". */
  fingerprint256: string;
}

export const ServerKeyFile = 'server-key.pem';
export const ServerCertificateFile = 'server-certificate.pem';
const KeyFile = ServerKeyFile;
const CertificateFile = ServerCertificateFile;

/**
 * Makes a new self-signed certificate. The dates are deliberately wide: a register whose clock
 * battery has died often thinks it's the year 2000, and a "not valid yet" certificate would lock it
 * out. Trust comes from the fingerprint the register pinned, not from the dates.
 */
export async function createServerCertificate(): Promise<ServerCertificate> {
  const algorithm = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
  const keys = await webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: randomBytes(16).toString('hex').replace(/^[89a-f]/, '1'), // positive, as X.509 requires
    name: 'CN=KVNsys Server',
    notBefore: new Date('2000-01-01T00:00:00Z'),
    notAfter: new Date('2099-12-31T00:00:00Z'),
    signingAlgorithm: algorithm,
    // Node's key pair and the library's are the same thing under two type names.
    keys: keys as unknown as Parameters<typeof x509.X509CertificateGenerator.createSelfSigned>[0]['keys'],
    extensions: [
      // Marked as its own authority, as `openssl req -x509` does by default. Electron's TLS
      // (BoringSSL) only accepts a pinned certificate as a trust anchor if it is one; plain Node is
      // more lenient, so this was found by running the real app. It's safe because the register
      // also checks the exact fingerprint: a certificate this one signed would have another.
      new x509.BasicConstraintsExtension(true, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyCertSign, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension([
        { type: 'dns', value: 'localhost' },
        { type: 'dns', value: hostname() },
        { type: 'ip', value: '127.0.0.1' },
      ]),
    ],
  });
  const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey));
  const key = `-----BEGIN PRIVATE KEY-----\n${pkcs8.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END PRIVATE KEY-----\n`;
  const cert = certificate.toString('pem');
  return { key, cert, fingerprint256: new X509Certificate(cert).fingerprint256 };
}

/**
 * This server's certificate: made on first start, then the very same one every time after, because
 * every register that has connected trusts exactly this one. Replacing it means resetting every
 * register's trust, so it's never replaced quietly.
 */
export async function loadOrCreateServerCertificate(dir: string): Promise<ServerCertificate & { created: boolean }> {
  const keyPath = join(dir, KeyFile);
  const certPath = join(dir, CertificateFile);
  const haveKey = existsSync(keyPath);
  const haveCert = existsSync(certPath);

  if (haveKey && haveCert) {
    const cert = readFileSync(certPath, 'utf8');
    return { key: readFileSync(keyPath, 'utf8'), cert, fingerprint256: new X509Certificate(cert).fingerprint256, created: false };
  }
  if (haveKey !== haveCert) {
    const [found, missing] = haveKey ? [keyPath, certPath] : [certPath, keyPath];
    throw new Error(
      `Found ${found} but not ${missing}. Restore both from a backup. Making a new pair instead would ` +
        "change this server's identity, and every register would then refuse it until IT resets them.",
    );
  }

  const made = await createServerCertificate();
  mkdirSync(dir, { recursive: true });
  // Owner-only where the system supports it. On Windows, the folder's permissions decide who can read it.
  writeFileSync(keyPath, made.key, { mode: 0o600 });
  writeFileSync(certPath, made.cert);
  return { ...made, created: true };
}

/**
 * Where the server keeps its own files when KVNSYS_SERVER_DATA doesn't say otherwise. On Windows
 * it's machine-wide, C:\ProgramData\KVNsys\Server: a server belongs to the PC, not to whoever is
 * signed in, and it has to be found in the same place once it runs as a Windows service.
 */
export function defaultServerDataDir(): string {
  return process.platform === 'win32'
    ? join(process.env.ProgramData ?? 'C:\ProgramData', 'KVNsys', 'Server')
    : join(homedir(), '.kvnsys', 'server');
}

/** Where earlier versions kept them on Windows: the signed-in account's own folder. */
export function earlierServerDataDir(): string | null {
  return process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'KVNsys', 'Server')
    : null;
}
