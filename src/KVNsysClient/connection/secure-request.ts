import { X509Certificate } from 'node:crypto';
import { request } from 'node:https';
import type { TLSSocket } from 'node:tls';

/** What a register remembers about a server it trusts: its certificate, and that certificate's fingerprint. */
export interface ServerPin {
  fingerprint256: string;
  /** PEM. */
  certificate: string;
}

export type SecureFailure = 'unreachable' | 'timeout' | 'certificate-changed' | 'not-secure';

export class SecureRequestError extends Error {
  constructor(
    readonly kind: SecureFailure,
    message: string,
  ) {
    super(message);
    this.name = 'SecureRequestError';
  }
}

export interface SecureResponse {
  status: number;
  body: unknown;
  /** The certificate the server presented. On a first contact, this is what gets remembered. */
  presented: ServerPin;
}

const PinMismatch = 'KVNSYS_PIN_MISMATCH';

/**
 * One HTTPS request to a KVNsys Server.
 *
 * With a pin, the server must present exactly the pinned certificate, checked during the
 * handshake, before a single byte of the request is sent. Without one (a first contact), any
 * certificate is accepted, and the caller decides whether to remember it. KVNsys servers make their
 * own certificates, so no certificate authority is involved: trust is the pin.
 */
export function requestJson(options: {
  address: string;
  path: string;
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
  /** The pass from a sign-in, sent as "Authorization: Bearer". Only ever sent to a pinned server. */
  pass?: string;
  pin: ServerPin | null;
  timeoutMs: number;
}): Promise<SecureResponse> {
  const { pin } = options;
  if (options.pass !== undefined && !pin) {
    // A pass proves who's signed in. Like a password, it never goes to a server that isn't trusted yet.
    return Promise.reject(new Error('A sign-in pass is only ever sent to a server this register has pinned.'));
  }
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body);

  return new Promise((resolve, reject) => {
    const req = request(new URL(options.path, options.address), {
      method: options.method ?? 'GET',
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(options.pass ? { Authorization: `Bearer ${options.pass}` } : {}),
      },
      timeout: options.timeoutMs,
      agent: false,
      ...(pin
        ? {
            // The pinned certificate is the only thing trusted, and it must be that exact one.
            ca: pin.certificate,
            checkServerIdentity: (_host: string, presented: { fingerprint256: string }) =>
              presented.fingerprint256 === pin.fingerprint256
                ? undefined
                : Object.assign(new Error('certificate fingerprint does not match'), { code: PinMismatch }),
          }
        : { rejectUnauthorized: false }),
    });

    req.on('timeout', () => req.destroy(Object.assign(new Error('timed out'), { code: 'KVNSYS_TIMEOUT' })));
    req.on('error', (error) => reject(classify(error, pin !== null)));
    req.on('response', (res) => {
      const raw = (res.socket as TLSSocket).getPeerCertificate(true)?.raw;
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('error', (error) => reject(classify(error, pin !== null)));
      res.on('end', () => {
        if (!raw) {
          reject(new SecureRequestError('not-secure', 'The server presented no certificate.'));
          return;
        }
        const certificate = new X509Certificate(raw);
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          body = undefined;
        }
        resolve({
          status: res.statusCode ?? 0,
          body,
          presented: { fingerprint256: certificate.fingerprint256, certificate: certificate.toString() },
        });
      });
    });

    req.end(payload);
  });
}

function classify(error: unknown, pinned: boolean): SecureRequestError {
  const code = (error as { code?: unknown }).code;
  const text = error instanceof Error ? error.message : String(error);
  if (code === 'KVNSYS_TIMEOUT') return new SecureRequestError('timeout', text);
  if (pinned && typeof code === 'string' && /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|PIN_MISMATCH/.test(code)) {
    return new SecureRequestError('certificate-changed', text);
  }
  // A plain-HTTP server answering a secure request: the handshake makes no sense to either side.
  if (code === 'EPROTO' || code === 'ERR_SSL_WRONG_VERSION_NUMBER' || /wrong version number/i.test(text)) {
    return new SecureRequestError('not-secure', text);
  }
  return new SecureRequestError('unreachable', text);
}
