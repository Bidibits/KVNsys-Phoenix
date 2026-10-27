import { z } from 'zod';

// The calls between a running KVNsys Server and its dashboard, on the same PC. They never cross the
// shop's network: the server answers them only on 127.0.0.1, and only with the key it wrote into
// its own folder, which only the server's service and the PC's administrators can read.

/** What the running server writes into its folder: where to reach it, and the key to show. */
export const ControlFileContents = z.object({
  port: z.number().int().min(1).max(65535),
  key: z.string().min(32),
});
export type ControlFileContents = z.infer<typeof ControlFileContents>;

export const StatusPath = '/status';
export const DisconnectPath = '/disconnect';
export const ServerPasswordPath = '/server-password';
export const ServerPasswordOffPath = '/server-password/off';

/** One person signed in somewhere, as the dashboard lists them. Never their pass. */
export const ConnectedPerson = z.object({
  /** What the dashboard sends back to disconnect them. */
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  /** The register they're at, as the shop calls it, or null when they signed in at none. */
  register: z.object({ code: z.string(), name: z.string() }).nullable(),
  /** ISO date and time they signed in. */
  since: z.string(),
});
export type ConnectedPerson = z.infer<typeof ConnectedPerson>;

/** How the running server is doing. */
export const ServerStatus = z.object({
  version: z.string(),
  protocol: z.number().int(),
  /** The port registers reach it on. */
  port: z.number().int(),
  /** This PC's addresses on the shop's network. */
  addresses: z.array(z.string()),
  /** ISO date and time this run started. */
  startedAt: z.string(),
  serverPassword: z.enum(['off', 'on', 'damaged']),
  connected: z.array(ConnectedPerson),
});
export type ServerStatus = z.infer<typeof ServerStatus>;

export const DisconnectRequest = z.object({ id: z.string().min(1).max(100) });
export const ServerPasswordRequest = z.object({ password: z.string().max(200), again: z.string().max(200) });

/** Done, or not, with a message for the person at the dashboard. */
export const ControlDone = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), message: z.string() }),
]);
export type ControlDone = z.infer<typeof ControlDone>;
