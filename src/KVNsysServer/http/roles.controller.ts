import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { Accesses, checkRoleDetails, type AccessName, type RoleCatalog } from '@kvnsys/core';
import { RoleFields, type RoleListReply, type RoleReply } from '@kvnsys/wire';
import type { Authorizer } from '../identity/authorizer.js';
import type { Sessions } from '../identity/sessions.js';
import { bearerToken, NoDatabase, problem } from './problems.js';
import { lineageOf, saving } from './saving.js';
import { RolesOperation } from './tokens.js';

const NotThere = "That role isn't there any more.";
const NotUnderstood = "The role's details didn't arrive in a form the server understands.";

export interface RolesOperationParts {
  roles: RoleCatalog;
  authorizer: Authorizer;
  sessions: Sessions;
}

/** The role calls (see KVNsysWire's roles.ts). Each one checks the pass and the right first. */
@Controller('roles')
export class RolesController {
  constructor(@Inject(RolesOperation) private readonly operation: { roles: RolesOperationParts | null }) {}

  @Get()
  async list(@Headers('authorization') authorization: string | undefined): Promise<RoleListReply> {
    const { roles } = await this.allow(authorization, Accesses.RolesView);
    return { roles: await roles.list() };
  }

  @Get(':id')
  async get(@Headers('authorization') authorization: string | undefined, @Param('id') id: string): Promise<RoleReply> {
    const { roles } = await this.allow(authorization, Accesses.RolesView);
    const role = await roles.get(id);
    if (!role) throw problem(404, NotThere);
    return { role };
  }

  @Post()
  @HttpCode(201)
  async add(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<RoleReply> {
    const { roles, person } = await this.allow(authorization, Accesses.RolesManage);
    const fields = RoleFields.safeParse(body);
    if (!fields.success) throw problem(400, NotUnderstood);
    return { role: await saving(async () => roles.create(checkRoleDetails(fields.data), lineageOf(person))) };
  }

  @Put(':id')
  async change(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<RoleReply> {
    const { roles, sessions, person } = await this.allow(authorization, Accesses.RolesManage);
    const fields = RoleFields.safeParse(body);
    if (!fields.success) throw problem(400, NotUnderstood);
    const role = await saving(async () => roles.update(id, checkRoleDetails(fields.data), lineageOf(person)));
    // Switched off: everyone with this role is signed out now, on every register, not at their next request.
    if (role.status !== 'Active') for (const userId of await roles.memberIds(role.id)) sessions.cancelFor(userId);
    return { role };
  }

  /** The pass and the right, checked before anything else is even read. */
  private async allow(authorization: string | undefined, access: AccessName) {
    const parts = this.operation.roles;
    if (!parts) throw problem(503, NoDatabase);
    const verdict = await parts.authorizer.check(bearerToken(authorization), access);
    if (!verdict.ok) throw problem(verdict.status, verdict.message);
    return { ...parts, person: verdict.person };
  }
}
