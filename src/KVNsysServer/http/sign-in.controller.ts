import { Body, Controller, HttpCode, HttpException, Inject, Post } from '@nestjs/common';
import { serverMachineCode, type PcIdentity, type RegisterBook, type ShopDirectory } from '@kvnsys/core';
import { SignInRequest, type SignInReply } from '@kvnsys/wire';
import { Sessions, type SessionRegister } from '../identity/sessions.js';
import type { SignIn } from '../identity/sign-in.js';
import { FirstShopCode } from '../setup/first-shop.js';
import { NoDatabase } from './problems.js';
import { SignInOperation } from './tokens.js';

export interface SignInOperationParts {
  signIn: SignIn;
  registers: RegisterBook;
  shops: ShopDirectory;
  /** The PC this server runs on, which says which shop a new register belongs to. */
  server: PcIdentity;
}

const no = (message: string): SignInReply => ({ signedIn: false, message });

@Controller('sign-in')
export class SignInController {
  constructor(
    @Inject(SignInOperation) private readonly operation: { signIn: SignInOperationParts | null },
    @Inject(Sessions) private readonly sessions: Sessions,
  ) {}

  /**
   * Yes (200) with who it is, the register it's at, and a pass for later requests, or no with the
   * reason: 400 bad request, 401 wrong, 403 the account or the register is switched off. A PC
   * signing in for the first time is recorded as a register of the server's own shop.
   */
  @Post()
  @HttpCode(200)
  async signIn(@Body() body: unknown): Promise<SignInReply> {
    const parts = this.operation.signIn;
    if (!parts) {
      throw new HttpException(no(NoDatabase), 503);
    }
    const request = SignInRequest.safeParse(body);
    if (!request.success) {
      throw new HttpException(no('Type a username and a password.'), 400);
    }
    const outcome = await parts.signIn.run(request.data.username, request.data.password);
    if (!outcome.ok) {
      throw new HttpException(no(outcome.message), outcome.problem === 'switched-off' ? 403 : 401);
    }

    // Only once the password is right, so a stranger can't record registers.
    let register: SessionRegister | null = null;
    const pc = request.data.register;
    const shop = pc ? await parts.shops.serverShop(parts.server, serverMachineCode(FirstShopCode)) : null;
    if (pc && shop) {
      const recognised = await parts.registers.recognise(pc, shop.id, { userId: outcome.user.id, machineId: null, locationId: shop.id });
      if (recognised.status !== 'Active') {
        // Short, so it fits the sign-in screen on one line.
        throw new HttpException(no(`This register, ${recognised.name}, is switched off. Ask a manager.`), 403);
      }
      register = { machineId: recognised.id, locationId: recognised.locationId, code: recognised.code, name: recognised.name };
    }

    const pass = this.sessions.start(outcome.user, register);
    const { username, displayName, roleCode, rights } = outcome.user;
    return {
      signedIn: true,
      user: { username, displayName, roleCode, rights, register: register && { code: register.code, name: register.name } },
      session: { token: pass.token, expiresAt: pass.expiresAt.toISOString() },
    };
  }
}
