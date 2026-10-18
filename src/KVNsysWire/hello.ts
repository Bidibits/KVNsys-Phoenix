import { z } from 'zod';

/**
 * The version of the calls between client and server. They only talk when both have the same
 * number, so a branch that updated one but not the other gets a clear message instead of
 * strange errors. Raise it whenever a call is added or changes shape.
 *
 * 1: hello. 2: sign-in. 3: sessions (sign-in hands back a pass; session check; sign-out).
 * 4: products (list, find, get, add, change). 5: sign-in also says which rights the role holds.
 */
export const ProtocolVersion = 5;

/** The port KVNsys Server listens on unless told otherwise. The old KVNsys used it too. */
export const DefaultPort = 9000;

/** Where a client asks "are you a KVNsys server, and which version?" */
export const HelloPath = '/api/hello';

/** The server's answer. It says what the server is, and nothing about the shop's data. */
export const ServerHello = z.object({
  product: z.literal('KVNsys Server'),
  version: z.string(),
  protocol: z.number().int().positive(),
});
export type ServerHello = z.infer<typeof ServerHello>;
