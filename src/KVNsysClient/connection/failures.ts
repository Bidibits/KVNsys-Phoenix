import { SecureRequestError } from './secure-request.js';

export type TransportProblem = 'unreachable' | 'not-trusted' | 'not-kvnsys';

/**
 * What went wrong on the way to the server, in words a manager can act on. Connecting and signing
 * in share these, so the same problem always reads the same way.
 */
export function describeTransportFailure(
  error: unknown,
  address: string,
  timeoutMs: number,
): { reason: TransportProblem; message: string } {
  const kind = error instanceof SecureRequestError ? error.kind : 'unreachable';
  switch (kind) {
    case 'certificate-changed':
      return {
        reason: 'not-trusted',
        message:
          `The server at ${address} isn't the one this register trusts: its security certificate is different. ` +
          "If the server PC was replaced or reinstalled, IT needs to reset this register's trust. " +
          "Otherwise, don't use it: something may be pretending to be the server.",
      };
    case 'not-secure':
      return {
        reason: 'not-kvnsys',
        message: `Something answered at ${address}, but not over a secure connection. If it's an older KVNsys Server, update it.`,
      };
    case 'timeout':
      return {
        reason: 'unreachable',
        message: `The server at ${address} didn't answer within ${timeoutMs / 1000} seconds. It may be busy, or the address may be wrong.`,
      };
    default:
      return {
        reason: 'unreachable',
        message:
          `Couldn't reach a server at ${address}. Check the address, that the server PC is on with KVNsys Server ` +
          "running, and that this PC is on the shop's network.",
      };
  }
}
