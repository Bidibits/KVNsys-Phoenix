import { HelloPath, JoinPath, JoinReply, ProtocolVersion, ServerHello } from '@kvnsys/wire';
import { describeTransportFailure, type TransportProblem } from './failures.js';
import { requestJson, type ServerPin } from './secure-request.js';
import { normalizeServerAddress } from './server-address.js';

export interface ConnectedServer {
  /** Ready to save and reuse, such as "https://192.168.0.111:9000". */
  address: string;
  version: string;
  protocol: number;
  /** True the first time this register meets this server: its certificate has just been trusted. */
  firstTrust: boolean;
  /** True when the server has a password: give it with joinServer, then at every sign-in. */
  needsServerPassword: boolean;
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
    server: {
      address,
      version: hello.data.version,
      protocol: hello.data.protocol,
      firstTrust: !pin,
      needsServerPassword: hello.data.serverPassword,
    },
  };
}

export type JoinProblem = 'server-password' | 'not-connected' | TransportProblem;

export type JoinResult = { ok: true } | { ok: false; reason: JoinProblem; message: string };

/**
 * Checks the server password with a server that has one. Like any password, it only ever goes to a
 * server this register has already pinned: connectToServer first.
 */
export async function joinServer(
  address: string,
  serverPassword: string,
  options: { pin: ServerPin | null; timeoutMs?: number },
): Promise<JoinResult> {
  if (!options.pin) {
    return {
      ok: false,
      reason: 'not-connected',
      message: "This register hasn't connected to that server securely yet, so it won't send a password there. Connect first.",
    };
  }
  if (!serverPassword) return { ok: false, reason: 'server-password', message: 'Type the server password.' };

  const timeoutMs = options.timeoutMs ?? DefaultTimeoutMs;
  let response;
  try {
    response = await requestJson({ address, path: JoinPath, method: 'POST', body: { serverPassword }, pin: options.pin, timeoutMs });
  } catch (error) {
    return { ok: false, ...describeTransportFailure(error, address, timeoutMs) };
  }
  const reply = JoinReply.safeParse(response.body);
  if (!reply.success) {
    return { ok: false, reason: 'not-kvnsys', message: `The server at ${address} gave an answer this app doesn't understand.` };
  }
  return reply.data.joined ? { ok: true } : { ok: false, reason: 'server-password', message: reply.data.message };
}

function failure(error: unknown, address: string, timeoutMs: number): ConnectResult {
  return { ok: false, ...describeTransportFailure(error, address, timeoutMs) };
}

/** Says which side needs updating when the app and the server speak different protocols. */
export function mismatchMessage(appProtocol: number, serverProtocol: number, address: string): string {
  const fix = serverProtocol > appProtocol ? 'Update this app to match the server.' : 'Update KVNsys Server to match this app.';
  return (
    `This app and the KVNsys Server at ${address} are from different updates ` +
    `(app: protocol ${appProtocol}, server: protocol ${serverProtocol}). ${fix}`
  );
}
