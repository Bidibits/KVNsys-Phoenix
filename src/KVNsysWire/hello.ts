import { z } from 'zod';

/**
 * The version of the calls between client and server. They only talk when both have the same
 * number, so a branch that updated one but not the other gets a clear message instead of
 * strange errors. Raise it whenever a call is added or changes shape.
 *
 * 1: hello. 2: sign-in. 3: sessions (sign-in hands back a pass; session check; sign-out).
 * 4: products (list, find, get, add, change). 5: sign-in also says which rights the role holds.
 * 6: accounts (list, get, add, change, new password) and the roles an account can be given.
 * 7: roles (list, get, make, change); the roles an account can be given moved to /api/role-choices.
 * 8: stock (the shop's stock, finding a product by code or barcode, one product's stock and movements,
 *    recording goods in and counts put right).
 * 9: selling (finding a product to ring up, recording a sale paid in cash).
 * 10: a day's sales and one receipt by id; a receipt's cashier can be unknown.
 * 11: registers: sign-in says which PC, the person signed in comes with their register, a receipt
 *     names its register, and the registers can be listed, renamed and switched off.
 * 12: shifts: start one with the cash in the drawer, end it with the cash counted; a sale needs one.
 * 13: the catalogue's lists: suppliers, brands, manufacturers and categories (list, get, add, change).
 * 14: every product field (sorting, unit, stock or not, cost, promo, wholesale, warranty), and its picture.
 * 15: a product says whether it has a picture.
 * 16: the till charges promo and wholesale prices: a product to ring up carries them, and each
 *     receipt line says which price it was charged at.
 * 17: the server password: hello says whether the server has one, a register checks it at
 *     /api/join, and every sign-in carries it.
 * 18: the audit log: the newest changes, by table, record, person and day, with names in place of ids.
 * 19: every list sends each record's history (who made it and who last changed it: when, on which
 *     machine, at which shop); registers carry their hardware id and description, accounts and
 *     roles their description, and the register list each one's shop.
 */
export const ProtocolVersion = 19;

/** The port KVNsys Server listens on unless told otherwise. The old KVNsys used it too. */
export const DefaultPort = 9000;

/** Where a client asks "are you a KVNsys server, and which version?" */
export const HelloPath = '/api/hello';

/** The server's answer. It says what the server is, and nothing about the shop's data. */
export const ServerHello = z.object({
  product: z.literal('KVNsys Server'),
  version: z.string(),
  protocol: z.number().int().positive(),
  /** True when a register must give the server password (at /api/join, then at every sign-in). */
  serverPassword: z.boolean(),
});
export type ServerHello = z.infer<typeof ServerHello>;
