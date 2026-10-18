import { HttpException } from '@nestjs/common';
import type { ProblemReply } from '@kvnsys/wire';

/** What a register is told when the server was started without a database. */
export const NoDatabase = "KVNsys Server isn't connected to its database. Check DATABASE_URL in its settings.";

/** A refusal: the status says what kind, the message says why, in words it's safe to show at a register. */
export function problem(status: number, message: string): HttpException {
  return new HttpException({ message } satisfies ProblemReply, status);
}

/** The pass from an "Authorization: Bearer <token>" header, or null when there isn't one. */
export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer (\S+)$/i.exec(header ?? '');
  return match?.[1] ?? null;
}
