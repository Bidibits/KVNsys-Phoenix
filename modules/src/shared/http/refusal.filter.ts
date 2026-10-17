import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ApiError } from '@phoenix/contracts';
import type { Response } from 'express';
import { Refusal, type RefusalKind } from '../domain/refusal.js';

const statusFor: Record<RefusalKind, number> = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  'not-found': 404,
  conflict: 409,
};

/** Every error reply has one shape, `{ statusCode, message }`, so a screen can always show it. */
@Catch()
export class RefusalFilter implements ExceptionFilter {
  private readonly log = new Logger('Phoenix');

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(error);
    response.status(body.statusCode).json(body);
  }

  private toBody(error: unknown): ApiError {
    if (error instanceof Refusal) {
      return { statusCode: statusFor[error.kind], message: error.message };
    }
    if (error instanceof HttpException) {
      const status = error.getStatus();
      return { statusCode: status, message: status === 404 ? 'There is nothing at that address.' : error.message };
    }
    // Anything else is a bug. Log it in full; tell the person something they can act on.
    this.log.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    return { statusCode: 500, message: 'Something went wrong on the server. It has been logged.' };
  }
}
