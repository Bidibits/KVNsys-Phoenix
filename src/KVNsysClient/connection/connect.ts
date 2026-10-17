import { HelloPath, ProtocolVersion, ServerHello } from '@kvnsys/wire';
import { normalizeServerAddress } from './server-address.js';

export interface ConnectedServer {
  /** Ready to save and reuse, such as "http://192.168.0.111:9000". */
  address: string;
  version: string;
  protocol: number;
}

export type ConnectProblem = 'bad-address' | 'unreachable' | 'not-kvnsys' | 'protocol-mismatch';

export type ConnectResult =
  | { ok: true; server: ConnectedServer }
  | { ok: false; reason: ConnectProblem; message: string };

/** A shop's network answers in milliseconds. This allows for a slow or busy server PC. */
const DefaultTimeoutMs = 5000;

/**
 * Asks the server at `typedAddress` who it is, and checks it's a KVNsys Server that speaks the
 * same protocol as this app. It never throws for the expected problems: each one comes back with
 * a message a manager can act on.
 */
export async function connectToServer(typedAddress: string, options: { timeoutMs?: number } = {}): Promise<ConnectResult> {
  const address = normalizeServerAddress(typedAddress);
  if (!address) {
    return {
      ok: false,
      reason: 'bad-address',
      message: `"${typedAddress.trim()}" isn't a server address. Type it like 192.168.0.111 or 192.168.0.111:9000.`,
    };
  }

  const timeoutMs = options.timeoutMs ?? DefaultTimeoutMs;
  let body: unknown;
  let answeredOk: boolean;
  try {
    const response = await fetch(address + HelloPath, { signal: AbortSignal.timeout(timeoutMs) });
    answeredOk = response.ok;
    body = await response.json().catch(() => undefined);
  } catch (error) {
    const timedOut = (error as { name?: string } | null)?.name === 'TimeoutError';
    return {
      ok: false,
      reason: 'unreachable',
      message: timedOut
        ? `The server at ${address} didn't answer within ${timeoutMs / 1000} seconds. It may be busy, or the address may be wrong.`
        : `Couldn't reach a server at ${address}. Check the address, that the server PC is on with KVNsys Server running, and that this PC is on the shop's network.`,
    };
  }

  const hello = answeredOk ? ServerHello.safeParse(body) : undefined;
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

  return { ok: true, server: { address, version: hello.data.version, protocol: hello.data.protocol } };
}

/** Says which side needs updating when the app and the server speak different protocols. */
export function mismatchMessage(appProtocol: number, serverProtocol: number, address: string): string {
  const fix = serverProtocol > appProtocol ? 'Update this app to match the server.' : 'Update KVNsys Server to match this app.';
  return (
    `This app and the KVNsys Server at ${address} are from different updates ` +
    `(app: protocol ${appProtocol}, server: protocol ${serverProtocol}). ${fix}`
  );
}
