import { HelloPath, ProtocolVersion, ServerHello } from '@kvnsys/wire';
import { requestJson, SecureRequestError, type ServerPin } from './secure-request.js';
import { normalizeServerAddress } from './server-address.js';

export interface ConnectedServer {
  /** Ready to save and reuse, such as "https://192.168.0.111:9000". */
  address: string;
  version: string;
  protocol: number;
  /** True the first time this register meets this server: its certificate has just been trusted. */
  firstTrust: boolean;
}

export type ConnectProblem = 'bad-address' | 'unreachable' | 'not-kvnsys' | 'protocol-mismatch' | 'not-trusted';

export type ConnectResult =
  | { ok: true; server: ConnectedServer }
  | { ok: false; reason: ConnectProblem; message: string };

/**
 * Which servers this register trusts. The engine decides when to trust (trust on first use, and
 * only once it's sure it's a KVNsys Server); the app decides where the pins are kept.
 */
export interface ServerTrust {
  pinFor(address: string): ServerPin | null;
  remember(address: string, pin: ServerPin): void;
}

/** A shop's network answers in milliseconds. This allows for a slow or busy server PC. */
const DefaultTimeoutMs = 5000;

/**
 * Asks the server at `typedAddress` who it is, over HTTPS, and checks it's a KVNsys Server that
 * speaks the same protocol. The first time, its certificate is remembered; after that, a server
 * presenting any other certificate at that address is refused. It never throws for the expected
 * problems: each one comes back with a message a manager can act on.
 */
export async function connectToServer(
  typedAddress: string,
  options: { trust: ServerTrust; timeoutMs?: number },
): Promise<ConnectResult> {
  const address = normalizeServerAddress(typedAddress);
  if (!address) {
    return {
      ok: false,
      reason: 'bad-address',
      message: `"${typedAddress.trim()}" isn't a server address. Type it like 192.168.0.111 or 192.168.0.111:9000.`,
    };
  }

  const timeoutMs = options.timeoutMs ?? DefaultTimeoutMs;
  const pin = options.trust.pinFor(address);
  let response;
  try {
    response = await requestJson({ address, path: HelloPath, pin, timeoutMs });
  } catch (error) {
    return failure(error, address, timeoutMs);
  }

  const hello = response.status === 200 ? ServerHello.safeParse(response.body) : undefined;
  if (!hello?.success) {
    return {
      ok: false,
      reason: 'not-kvnsys',
      message: `Something answered at ${address}, but it isn't a KVNsys Server. Check the address.`,
    };
  }
  if (hello.data.protocol !== ProtocolVersion) {
    return { ok: false, reason: 'protocol-mismatch', message: mismatchMessage(ProtocolVersion, hello.data.protocol, address) };
  }

  // Only now, sure it's a KVNsys Server this app can talk to, is a first certificate trusted.
  if (!pin) options.trust.remember(address, response.presented);
  return {
    ok: true,
    server: { address, version: hello.data.version, protocol: hello.data.protocol, firstTrust: !pin },
  };
}

function failure(error: unknown, address: string, timeoutMs: number): ConnectResult {
  const kind = error instanceof SecureRequestError ? error.kind : 'unreachable';
  switch (kind) {
    case 'certificate-changed':
      return {
        ok: false,
        reason: 'not-trusted',
        message:
          `The server at ${address} isn't the one this register trusts: its security certificate is different. ` +
          "If the server PC was replaced or reinstalled, IT needs to reset this register's trust. " +
          'Otherwise, don\'t use it: something may be pretending to be the server.',
      };
    case 'not-secure':
      return {
        ok: false,
        reason: 'not-kvnsys',
        message: `Something answered at ${address}, but not over a secure connection. If it's an older KVNsys Server, update it.`,
      };
    case 'timeout':
      return {
        ok: false,
        reason: 'unreachable',
        message: `The server at ${address} didn't answer within ${timeoutMs / 1000} seconds. It may be busy, or the address may be wrong.`,
      };
    default:
      return {
        ok: false,
        reason: 'unreachable',
        message: `Couldn't reach a server at ${address}. Check the address, that the server PC is on with KVNsys Server running, and that this PC is on the shop's network.`,
      };
  }
}

/** Says which side needs updating when the app and the server speak different protocols. */
export function mismatchMessage(appProtocol: number, serverProtocol: number, address: string): string {
  const fix = serverProtocol > appProtocol ? 'Update this app to match the server.' : 'Update KVNsys Server to match this app.';
  return (
    `This app and the KVNsys Server at ${address} are from different updates ` +
    `(app: protocol ${appProtocol}, server: protocol ${serverProtocol}). ${fix}`
  );
}
