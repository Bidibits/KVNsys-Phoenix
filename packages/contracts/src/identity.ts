import { z } from 'zod';

export const SignInRequest = z.object({
  username: z.string().trim().min(1, 'Enter a username'),
  password: z.string().min(1, 'Enter a password'),
});
export type SignInRequest = z.infer<typeof SignInRequest>;

/** Who is signed in. Never carries the password hash. */
export const SessionUser = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string(),
  roleCode: z.string(),
  accesses: z.array(z.string()),
});
export type SessionUser = z.infer<typeof SessionUser>;
