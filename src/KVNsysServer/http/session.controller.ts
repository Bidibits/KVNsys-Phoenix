import { Controller, Get, Headers, HttpCode, HttpException, Inject, Post } from '@nestjs/common';
import type { SessionReply, SignOutReply } from '@kvnsys/wire';
import { Sessions } from '../identity/sessions.js';

/** What a register is told when its pass is unknown, cancelled or expired. */
export const SignInEnded = 'Your sign-in has ended. Sign in again.';

@Controller()
export class SessionController {
  constructor(@Inject(Sessions) private readonly sessions: Sessions) {}

  /** Whose pass this is, while it's good (200), or 401 when it isn't, or isn't any more. */
  @Get('session')
  session(@Headers('authorization') authorization: string | undefined): SessionReply {
    const token = bearerToken(authorization);
    const session = token ? this.sessions.find(token) : null;
    if (!session) {
      throw new HttpException({ signedIn: false, message: SignInEnded } satisfies SessionReply, 401);
    }
    const { username, displayName, roleCode } = session.user;
    return { signedIn: true, user: { username, displayName, roleCode }, expiresAt: session.expiresAt.toISOString() };
  }

  /** Cancels the pass. Always 200: a pass that's already gone is just as signed out. */
  @Post('sign-out')
  @HttpCode(200)
  signOut(@Headers('authorization') authorization: string | undefined): SignOutReply {
    const token = bearerToken(authorization);
    if (token) this.sessions.cancel(token);
    return { signedOut: true };
  }
}

/** The pass from an "Authorization: Bearer <token>" header, or null when there isn't one. */
function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer (\S+)$/i.exec(header ?? '');
  return match?.[1] ?? null;
}
