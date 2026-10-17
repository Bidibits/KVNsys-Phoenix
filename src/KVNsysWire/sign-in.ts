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

/** Yes, with who it is, or no, with a message it's safe to show the person at the register. */
export const SignInReply = z.discriminatedUnion('signedIn', [
  z.object({ signedIn: z.literal(true), user: SignedInUser }),
  z.object({ signedIn: z.literal(false), message: z.string() }),
]);
export type SignInReply = z.infer<typeof SignInReply>;
