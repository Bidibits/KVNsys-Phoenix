import type { Listed, Register, RegisterDetails } from '@kvnsys/core';
import { RegisterListReply, RegisterReply, registerPath, RegistersPath, type SessionPass } from '@kvnsys/wire';
import { callServer as call, type CallOptions, type Refused } from '../connection/server-call.js';

/** A register as the server sends it. */
export type SentRegister = Omit<Register, 'locationId'>;

/** A register as the Registers screen lists it: with the name of its shop, and its history. */
export type ListedRegister = Omit<Listed<Register>, 'locationId'> & { shopName: string };

export type RegisterListResult = { ok: true; registers: ListedRegister[] } | Refused;
export type RegisterResult = { ok: true; register: SentRegister } | Refused;

/** The shop's registers, the server PC first. */
export async function listRegisters(address: string, pass: SessionPass, options: CallOptions): Promise<RegisterListResult> {
  const answer = await call(address, pass, options, { path: RegistersPath }, RegisterListReply);
  return answer.ok ? { ok: true, registers: answer.reply.registers } : answer;
}

/** Renames a register, or switches it off or on. The server checks the name; switched off, its sign-ins end. */
export async function changeRegister(
  address: string,
  pass: SessionPass,
  id: string,
  details: { name: string; status: string },
  options: CallOptions,
): Promise<RegisterResult> {
  const body = { name: details.name, status: details.status as RegisterDetails['status'] };
  const answer = await call(address, pass, options, { path: registerPath(id), method: 'PUT', body }, RegisterReply);
  return answer.ok ? { ok: true, register: answer.reply.register } : answer;
}
