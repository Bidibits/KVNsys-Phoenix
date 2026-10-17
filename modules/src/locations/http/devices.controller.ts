import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { RegisterDeviceRequest, type DeviceStatus, type MachineSummary } from '@phoenix/contracts';
import type { Request, Response } from 'express';
import { Accesses } from '../../identity/domain/accesses.js';
import type { Session } from '../../identity/domain/session.js';
import { CurrentSession, RequiresAccess, SessionGuard } from '../../identity/http/session.guard.js';
import { cookieOptions, DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_MS, readCookie } from '../../shared/http/cookies.js';
import { ZodBody } from '../../shared/http/zod-body.pipe.js';
import { DeviceRegistrationService } from '../application/device-registration.service.js';
import type { MachineRecord } from '../domain/machine.js';

@Controller('devices')
export class DevicesController {
  constructor(@Inject(DeviceRegistrationService) private readonly registration: DeviceRegistrationService) {}

  /** What this browser is. Open to anyone: an unregistered device needs to be told so. */
  @Get('me')
  async me(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<DeviceStatus> {
    const token = readCookie(request, DEVICE_COOKIE);
    const machine = await this.registration.currentDevice(token);
    if (!machine || !token) return { registered: false };

    // Re-issue the cookie so a register in daily use never reaches the browser's 400-day cap.
    response.cookie(DEVICE_COOKIE, token, cookieOptions(request, DEVICE_COOKIE_MAX_AGE_MS));
    return { registered: true, machine: toSummary(machine) };
  }

  @Post('register')
  @UseGuards(SessionGuard)
  @RequiresAccess(Accesses.MachinesRegister)
  async register(
    @Body(new ZodBody(RegisterDeviceRequest)) body: RegisterDeviceRequest,
    @CurrentSession() session: Session,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MachineSummary> {
    const { machine, token } = await this.registration.register(session, body, readCookie(request, DEVICE_COOKIE));
    response.cookie(DEVICE_COOKIE, token, cookieOptions(request, DEVICE_COOKIE_MAX_AGE_MS));
    return toSummary(machine);
  }
}

function toSummary(machine: MachineRecord): MachineSummary {
  const { id, code, name } = machine.location;
  return { id: machine.id, code: machine.code, name: machine.name, location: { id, code, name } };
}
