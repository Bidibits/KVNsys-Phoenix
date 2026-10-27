import { Body, Controller, HttpCode, HttpException, Inject, Post } from '@nestjs/common';
import { JoinRequest, type JoinReply } from '@kvnsys/wire';
import { ServerPassword } from '../security/server-password.js';

@Controller('join')
export class JoinController {
  constructor(@Inject(ServerPassword) private readonly serverPassword: ServerPassword) {}

  /**
   * Checks the server password a register typed: yes (200), or no (401) with the reason. A server
   * without a password always says yes. Signing in checks it again, so this only spares a register
   * from finding out at its first sign-in.
   */
  @Post()
  @HttpCode(200)
  async join(@Body() body: unknown): Promise<JoinReply> {
    const request = JoinRequest.safeParse(body ?? {});
    const refusal = await this.serverPassword.check(request.success ? request.data.serverPassword : undefined);
    if (refusal) throw new HttpException({ joined: false, message: refusal } satisfies JoinReply, 401);
    return { joined: true };
  }
}
