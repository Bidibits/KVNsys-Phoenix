import type { CookieOptions, Request } from 'express';

export const SESSION_COOKIE = 'phoenix_session';
export const DEVICE_COOKIE = 'phoenix_device';

/**
 * Browsers cap a cookie's lifetime at 400 days (Chrome enforces it). A register's device
 * cookie is therefore re-issued every time the register checks in, so a register in daily
 * use never reaches the cap.
 */
export const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

/** HttpOnly so page scripts can't read it; SameSite=Strict so other sites can't send it. */
export function cookieOptions(request: Request, maxAgeMs: number): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', secure: request.secure, path: '/', maxAge: maxAgeMs };
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
