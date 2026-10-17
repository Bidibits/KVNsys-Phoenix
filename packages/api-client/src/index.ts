import {
  ApiError,
  DeviceStatus,
  LocationOption,
  MachineSummary,
  SessionUser,
  type RegisterDeviceRequest,
  type SignInRequest,
} from '@phoenix/contracts';
import { z, type ZodType } from 'zod';

/** A refusal from the API, carrying the message it is safe to show a person. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Typed calls to the Phoenix API. The browser keeps the session and device cookies;
 * this only ever talks to the same origin that served the page.
 */
export class PhoenixApi {
  constructor(private readonly baseUrl = '/api') {}

  deviceStatus(): Promise<DeviceStatus> {
    return this.call('GET', '/devices/me', DeviceStatus);
  }

  me(): Promise<SessionUser> {
    return this.call('GET', '/auth/me', SessionUser);
  }

  signIn(request: SignInRequest): Promise<SessionUser> {
    return this.call('POST', '/auth/sign-in', SessionUser, request);
  }

  async signOut(): Promise<void> {
    await this.call('POST', '/auth/sign-out', z.object({ signedOut: z.literal(true) }));
  }

  locations(): Promise<LocationOption[]> {
    return this.call('GET', '/locations', z.array(LocationOption));
  }

  registerDevice(request: RegisterDeviceRequest): Promise<MachineSummary> {
    return this.call('POST', '/devices/register', MachineSummary, request);
  }

  private async call<T>(method: string, path: string, reply: ZodType<T>, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(this.baseUrl + path, {
        method,
        credentials: 'same-origin',
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiRequestError(0, "Can't reach the Phoenix server. Check this device's network.");
    }

    const json: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = ApiError.safeParse(json);
      throw new ApiRequestError(
        response.status,
        error.success ? error.data.message : `The server answered ${response.status}.`,
      );
    }
    return reply.parse(json);
  }
}
