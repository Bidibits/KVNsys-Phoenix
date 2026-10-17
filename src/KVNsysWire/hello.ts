import { z } from 'zod';

/**
 * The version of the calls between client and server. They only talk when both have the same
 * number, so a branch that updated one but not the other gets a clear message instead of
 * strange errors. Raise it whenever a call changes shape.
 */
export const ProtocolVersion = 1;

/** Where a client asks "are you a KVNsys server, and which version?" */
export const HelloPath = '/api/hello';

/** The server's answer. It says what the server is, and nothing about the shop's data. */
export const ServerHello = z.object({
  product: z.literal('KVNsys Server'),
  version: z.string(),
  protocol: z.number().int().positive(),
});
export type ServerHello = z.infer<typeof ServerHello>;
