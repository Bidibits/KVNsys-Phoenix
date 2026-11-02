import { Body, Controller, Get, Headers, Inject, Put } from '@nestjs/common';
import { userSettingsProblem, type UserSettingsBook } from '@kvnsys/core';
import { UserSettingsOnWire, type MySettingsReply } from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { MySettingsOperation } from './tokens.js';

export interface MySettingsOperationParts {
  settings: UserSettingsBook;
  authorizer: Authorizer;
}

/**
 * The signed-in person's own settings (see KVNsysWire's user-settings.ts). They need a pass but no
 * right, since they're the person's own and change nothing of the business's; for the same reason they
 * aren't written to the audit log.
 */
@Controller('my-settings')
export class MySettingsController {
  constructor(@Inject(MySettingsOperation) private readonly operation: { mySettings: MySettingsOperationParts | null }) {}

  @Get()
  async read(@Headers('authorization') authorization: string | undefined): Promise<MySettingsReply> {
    const { parts, person } = await this.allow(authorization);
    return { settings: await parts.settings.read(person.id) };
  }

  @Put()
  async keep(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<MySettingsReply> {
    const { parts, person } = await this.allow(authorization);
    const settings = UserSettingsOnWire.safeParse(body);
    if (!settings.success) throw problem(400, "The settings didn't arrive in a form the server understands.");
    const issue = userSettingsProblem(settings.data);
    if (issue) throw problem(400, issue);
    await parts.settings.keep(person.id, settings.data);
    return { settings: settings.data };
  }

  /** The pass, checked before anything else is answered: no right is needed, only someone still allowed to sign in. */
  private async allow(authorization: string | undefined) {
    const parts = this.operation.mySettings;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), []);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    return { parts, person: verdict.person };
  }
}
