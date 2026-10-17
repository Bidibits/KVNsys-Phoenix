import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { SignInRequest, type SessionUser } from '@phoenix/contracts';
import type { Request, Response } from 'express';
import { cookieOptions, SESSION_COOKIE } from '../../shared/http/cookies.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { SignInService } from '../application/sign-in.service.js';
import { SessionLengthMs, type Session } from '../domain/session.js';
import { CurrentSession, SessionGuard, toSessionUser } from './session.guard.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(SignInService) private readonly signInService: SignInService) {}

  @Post('sign-in')
  @HttpCode(200)
  async signIn(
    @Body(new ZodBody(SignInRequest)) body: SignInRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SessionUser> {
    const { token, session } = await this.signInService.signIn(body.username, body.password);
    response.cookie(SESSION_COOKIE, token, cookieOptions(request, SessionLengthMs));
    return toSessionUser(session);
  }

  @Post('sign-out')
  @HttpCode(200)
  signOut(@Req() request: Request, @Res({ passthrough: true }) response: Response): { signedOut: true } {
    response.clearCookie(SESSION_COOKIE, { ...cookieOptions(request, 0), maxAge: undefined });
    return { signedOut: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentSession() session: Session): SessionUser {
    return toSessionUser(session);
  }
}
