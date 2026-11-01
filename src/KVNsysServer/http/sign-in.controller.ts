import { Body, Controller, HttpCode, HttpException, Inject, Post } from '@nestjs/common';
import { serverMachineCode, type PcIdentity, type MachineBook, type ShopDirectory } from '@kvnsys/core';
import { SignInRequest, type SignInReply } from '@kvnsys/wire';
import { Sessions, type SessionMachine } from '../identity/sessions.js';
import type { SignIn } from '../identity/sign-in.js';
import { ServerPassword } from '../security/server-password.js';
import { FirstShopCode } from '../setup/first-shop.js';
import { NoDatabase } from './problems.js';
import { SignInOperation } from './tokens.js';

export interface SignInOperationParts {
  signIn: SignIn;
  machines: MachineBook;
  shops: ShopDirectory;
  /** The PC this server runs on, which says which shop a new machine belongs to. */
  server: PcIdentity;
}

const no = (message: string): SignInReply => ({ signedIn: false, message });

@Controller('sign-in')
export class SignInController {
  constructor(
    @Inject(SignInOperation) private readonly operation: { signIn: SignInOperationParts | null },
    @Inject(Sessions) private readonly sessions: Sessions,
    @Inject(ServerPassword) private readonly serverPassword: ServerPassword,
  ) {}

  /**
   * Yes (200) with who it is, the machine it's at, and a pass for later requests, or no with the
   * reason: 400 bad request, 401 wrong (the server password, or the person's), 403 the account or
   * the machine is switched off. A PC signing in for the first time is recorded as a machine of
   * the server's own shop.
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
    // First, so a machine without the server password learns nothing about anyone's account.
    const refusal = await this.serverPassword.check(request.data.serverPassword);
    if (refusal) {
      throw new HttpException({ signedIn: false, message: refusal, serverPassword: true } satisfies SignInReply, 401);
    }
    const outcome = await parts.signIn.run(request.data.username, request.data.password);
    if (!outcome.ok) {
      throw new HttpException(no(outcome.message), outcome.problem === 'switched-off' ? 403 : 401);
    }

    // Only once the password is right, so a stranger can't record machines.
    let machine: SessionMachine | null = null;
    const pc = request.data.machine;
    const shop = pc ? await parts.shops.serverShop(parts.server, serverMachineCode(FirstShopCode)) : null;
    if (pc && shop) {
      const recognised = await parts.machines.recognise(pc, shop.id, { userId: outcome.user.id, machineId: null, locationId: shop.id });
      if (recognised.status !== 'Active') {
        // Short, so it fits the sign-in screen on one line.
        throw new HttpException(no(`This machine, ${recognised.name}, is switched off. Ask a manager.`), 403);
      }
      machine = { machineId: recognised.id, locationId: recognised.locationId, code: recognised.code, name: recognised.name };
    }

    const pass = this.sessions.start(outcome.user, machine);
    const { username, displayName, roleCode, rights } = outcome.user;
    return {
      signedIn: true,
      user: { username, displayName, roleCode, rights, machine: machine && { code: machine.code, name: machine.name } },
      session: { token: pass.token, expiresAt: pass.expiresAt.toISOString() },
    };
  }
}
