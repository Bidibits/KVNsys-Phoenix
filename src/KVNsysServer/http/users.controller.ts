import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import {
  Accesses,
  passwordProblem,
  type AccessName,
  type PasswordHasher,
  type UserAccounts,
} from '@kvnsys/core';
import {
  AccountFields,
  NewAccountFields,
  PasswordReset,
  type PasswordResetReply,
  type RoleChoiceListReply,
  type UserListReply,
  type UserReply,
} from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import type { Sessions } from '../identity/sessions.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { lineageOf, saving } from './saving.js';
import { UsersOperation } from './tokens.js';

const NotThere = "That account isn't there any more.";
const NotUnderstood = "The account's details didn't arrive in a form the server understands.";

export interface UsersOperationParts {
  accounts: UserAccounts;
  authorizer: Authorizer;
  hasher: PasswordHasher;
  sessions: Sessions;
}

/** The account calls (see KVNsysWire's users.ts). Each one checks the pass and the right first. */
@Controller()
export class UsersController {
  constructor(@Inject(UsersOperation) private readonly operation: { users: UsersOperationParts | null }) {}

  @Get('users')
  async list(@Headers('authorization') authorization: string | undefined): Promise<UserListReply> {
    const { accounts } = await this.allow(authorization, Accesses.UsersView);
    return { users: await accounts.list() };
  }

  @Get('users/:id')
  async get(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<UserReply> {
    const { accounts } = await this.allow(authorization, Accesses.UsersView);
    const user = await accounts.get(id);
    if (!user) throw problem(404, NotThere);
    return { user };
  }

  @Get('role-choices')
  async roles(@Headers('authorization') authorization: string | undefined): Promise<RoleChoiceListReply> {
    const { accounts } = await this.allow(authorization, Accesses.UsersView);
    return { roles: await accounts.roles() };
  }

  @Post('users')
  @HttpCode(201)
  async add(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<UserReply> {
    const { accounts, hasher, person } = await this.allow(authorization, Accesses.UsersManage);
    const fields = NewAccountFields.safeParse(body);
    if (!fields.success) throw problem(400, NotUnderstood);
    const { password, ...details } = fields.data;
    const passwordHash = await hasher.hash(readPassword(password));
    return { user: await saving(() => accounts.create(details, passwordHash, lineageOf(person))) };
  }

  @Put('users/:id')
  async change(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<UserReply> {
    const { accounts, sessions, person } = await this.allow(authorization, Accesses.UsersManage);
    const fields = AccountFields.safeParse(body);
    if (!fields.success) throw problem(400, NotUnderstood);
    const user = await saving(() => accounts.update(id, fields.data, lineageOf(person)));
    // Switched off: their passes end now, on every register, not at their next request.
    if (user.status !== 'Active') sessions.cancelFor(user.id);
    return { user };
  }

  @Post('users/:id/password')
  @HttpCode(200)
  async resetPassword(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<PasswordResetReply> {
    const { accounts, hasher, sessions, person } = await this.allow(authorization, Accesses.UsersManage);
    const fields = PasswordReset.safeParse(body);
    if (!fields.success) throw problem(400, "The new password didn't arrive in a form the server understands.");
    const passwordHash = await hasher.hash(readPassword(fields.data.password));
    await saving(() => accounts.setPassword(id, passwordHash, lineageOf(person)));
    // Whoever knew the old password, on whichever register, has to sign in again with the new one.
    sessions.cancelFor(id);
    return { passwordChanged: true };
  }

  /** The pass and the right, checked before anything else is even read. */
  private async allow(authorization: string | undefined, access: AccessName) {
    const users = this.operation.users;
    if (!users) throw problem(503, NoDatabase);
    const verdict = await users.authorizer.check(bearerToken(authorization), access);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    return { ...users, person: verdict.person };
  }
}

function readPassword(password: string): string {
  const trouble = passwordProblem(password);
  if (trouble) throw problem(400, trouble);
  return password;
}
