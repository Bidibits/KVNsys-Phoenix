import { z } from 'zod';

/** Where a client asks "is this the right password for this person?" */
export const SignInPath = '/api/sign-in';

export const SignInRequest = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1).max(200),
});
export type SignInRequest = z.infer<typeof SignInRequest>;

/** Who signed in. Never carries the password or its hash. */
export const SignedInUser = z.object({
  username: z.string(),
  displayName: z.string(),
  roleCode: z.string(),
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

/** Yes, with who it is and their pass, or no, with a message it's safe to show at the register. */
export const SignInReply = z.discriminatedUnion('signedIn', [
  z.object({ signedIn: z.literal(true), user: SignedInUser, session: SessionPass }),
  z.object({ signedIn: z.literal(false), message: z.string() }),
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
