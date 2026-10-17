import { Body, Controller, HttpCode, HttpException, Inject, Post } from '@nestjs/common';
import { SignInRequest, type SignInReply } from '@kvnsys/wire';
import type { SignIn } from '../identity/sign-in.js';
import { SignInOperation } from './tokens.js';

const no = (message: string): SignInReply => ({ signedIn: false, message });

@Controller('sign-in')
export class SignInController {
  constructor(@Inject(SignInOperation) private readonly operation: { signIn: SignIn | null }) {}

  /** Yes (200) with who it is, or no with the reason: 400 bad request, 401 wrong, 403 switched off. */
  @Post()
  @HttpCode(200)
  async signIn(@Body() body: unknown): Promise<SignInReply> {
    const signIn = this.operation.signIn;
    if (!signIn) {
      throw new HttpException(no("KVNsys Server isn't connected to its database. Check DATABASE_URL in its settings."), 503);
    }
    const request = SignInRequest.safeParse(body);
    if (!request.success) {
      throw new HttpException(no('Type a username and a password.'), 400);
    }
    const outcome = await signIn.run(request.data.username, request.data.password);
    if (!outcome.ok) {
      throw new HttpException(no(outcome.message), outcome.problem === 'switched-off' ? 403 : 401);
    }
    const { username, displayName, roleCode } = outcome.user;
    return { signedIn: true, user: { username, displayName, roleCode } };
  }
}
