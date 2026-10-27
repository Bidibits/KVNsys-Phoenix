import { z } from 'zod';

/** Where a client asks "is this the right password for this person?" */
export const SignInPath = '/api/sign-in';

/** The PC a register signs in at, as it reads itself: its hardware id survives renaming it. */
export const RegisterIdentity = z.object({
  hardwareId: z.string().trim().min(1).max(200),
  computerName: z.string().max(200),
});
export type RegisterIdentity = z.infer<typeof RegisterIdentity>;

/** Where a register checks the server password, before anyone signs in there. */
export const JoinPath = '/api/join';

/** The server password as typed. Left out when the register has none to give. */
export const JoinRequest = z.object({
  serverPassword: z.string().max(200).optional(),
});
export type JoinRequest = z.infer<typeof JoinRequest>;

/** Yes, or no with a message it's safe to show at the register. A server without a password always says yes. */
export const JoinReply = z.discriminatedUnion('joined', [
  z.object({ joined: z.literal(true) }),
  z.object({ joined: z.literal(false), message: z.string() }),
]);
export type JoinReply = z.infer<typeof JoinReply>;

export const SignInRequest = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1).max(200),
  /** The server password, when the server has one. It's checked before the username and password. */
  serverPassword: z.string().max(200).optional(),
  /**
   * The register's PC, so the server knows which register the sign-in is at (and records a new
   * one). Left out by a PC that couldn't read its own id: that sign-in is at no register.
   */
  register: RegisterIdentity.optional(),
});
export type SignInRequest = z.infer<typeof SignInRequest>;

/** Who signed in. Never carries the password or its hash. */
export const SignedInUser = z.object({
  username: z.string(),
  displayName: z.string(),
  roleCode: z.string(),
  /**
   * The role's rights at sign-in, so a register can grey out what this person can't open. Only a
   * courtesy: the server checks the real rights on every request.
   */
  rights: z.array(z.string()),
  /** The register this sign-in is at, as the shop calls it, or null when it's at none. */
  register: z.object({ code: z.string(), name: z.string() }).nullable(),
});
export type SignedInUser = z.infer<typeof SignedInUser>;

/**
 * The pass a successful sign-in hands back. Every later request that needs to know who's asking
 * carries the token, as "Authorization: Bearer <token>", until it expires or the person signs out.
 */
export const SessionPass = z.object({
  token: z.string().min(32),
  /** ISO date and time. */
  expiresAt: z.string(),
});
export type SessionPass = z.infer<typeof SessionPass>;

/**
 * Yes, with who it is and their pass, or no, with a message it's safe to show at the register.
 * `serverPassword` on a no means it was the server password that was missing or wrong (it may have
 * changed since the register connected), not the person's.
 */
export const SignInReply = z.discriminatedUnion('signedIn', [
  z.object({ signedIn: z.literal(true), user: SignedInUser, session: SessionPass }),
  z.object({ signedIn: z.literal(false), message: z.string(), serverPassword: z.literal(true).optional() }),
]);
export type SignInReply = z.infer<typeof SignInReply>;

/** Where a client asks "is this pass still good, and whose is it?" */
export const SessionPath = '/api/session';

export const SessionReply = z.discriminatedUnion('signedIn', [
  z.object({ signedIn: z.literal(true), user: SignedInUser, expiresAt: z.string() }),
  z.object({ signedIn: z.literal(false), message: z.string() }),
]);
export type SessionReply = z.infer<typeof SessionReply>;

/** Where a client hands its pass back. The server cancels it, so it can't be used again. */
export const SignOutPath = '/api/sign-out';

export const SignOutReply = z.object({ signedOut: z.literal(true) });
export type SignOutReply = z.infer<typeof SignOutReply>;
