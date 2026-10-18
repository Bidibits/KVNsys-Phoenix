import { Body, Controller, HttpCode, HttpException, Inject, Post } from '@nestjs/common';
import { SignInRequest, type SignInReply } from '@kvnsys/wire';
import { Sessions } from '../identity/sessions.js';
import type { SignIn } from '../identity/sign-in.js';
import { NoDatabase } from './problems.js';
import { SignInOperation } from './tokens.js';

const no = (message: string): SignInReply => ({ signedIn: false, message });

@Controller('sign-in')
export class SignInController {
  constructor(
    @Inject(SignInOperation) private readonly operation: { signIn: SignIn | null },
    @Inject(Sessions) private readonly sessions: Sessions,
  ) {}

  /**
   * Yes (200) with who it is and a pass for later requests, or no with the reason: 400 bad
   * request, 401 wrong, 403 switched off.
   */
  @Post()
  @HttpCode(200)
  async signIn(@Body() body: unknown): Promise<SignInReply> {
    const signIn = this.operation.signIn;
    if (!signIn) {
      throw new HttpException(no(NoDatabase), 503);
    }
    const request = SignInRequest.safeParse(body);
    if (!request.success) {
      throw new HttpException(no('Type a username and a password.'), 400);
    }
    const outcome = await signIn.run(request.data.username, request.data.password);
    if (!outcome.ok) {
      throw new HttpException(no(outcome.message), outcome.problem === 'switched-off' ? 403 : 401);
    }
    const pass = this.sessions.start(outcome.user);
    const { username, displayName, roleCode } = outcome.user;
    return {
      signedIn: true,
      user: { username, displayName, roleCode },
      session: { token: pass.token, expiresAt: pass.expiresAt.toISOString() },
    };
  }
}
