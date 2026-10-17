import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SessionUser } from '@phoenix/contracts';
import type { Request } from 'express';
import { Refusal } from '../../shared/domain/refusal.js';
import { readCookie, SESSION_COOKIE } from '../../shared/http/cookies.js';
import { SessionTokens } from '../application/ports.js';
import { AccessDescriptions, holds, type AccessName } from '../domain/accesses.js';
import type { Session } from '../domain/session.js';

const RequiredAccess = 'phoenix:required-access';

/** Marks an endpoint as needing one named right. Use together with `@UseGuards(SessionGuard)`. */
export const RequiresAccess = (access: AccessName) => SetMetadata(RequiredAccess, access);

type RequestWithSession = Request & { phoenixSession?: Session };

/** Lets a request through only with a valid session, and the right it needs if one is named. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(SessionTokens) private readonly tokens: SessionTokens,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const session = this.tokens.read(readCookie(request, SESSION_COOKIE));
    if (!session) throw new Refusal('unauthenticated', 'Sign in first.');

    const required = this.reflector.getAllAndOverride<AccessName | undefined>(RequiredAccess, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !holds(session.accesses, required)) {
      throw new Refusal('forbidden', `Your role can't do this. It needs the right to: ${AccessDescriptions[required].toLowerCase()}.`);
    }

    request.phoenixSession = session;
    return true;
  }
}

/** The signed-in session, in a handler behind `SessionGuard`. */
export const CurrentSession = createParamDecorator((_: unknown, context: ExecutionContext): Session => {
  const session = context.switchToHttp().getRequest<RequestWithSession>().phoenixSession;
  if (!session) throw new Error('CurrentSession used on a handler without SessionGuard.');
  return session;
});

export function toSessionUser(session: Session): SessionUser {
  return {
    id: session.userId,
    username: session.username,
    displayName: session.displayName,
    roleCode: session.roleCode,
    accesses: session.accesses,
  };
}
