import type { Listed, Machine, MachineDetails } from '@kvnsys/core';
import { MachineListReply, MachineReply, machinePath, MachinesPath, type SessionPass } from '@kvnsys/wire';
import { callServer as call, type CallOptions, type Refused } from '../connection/server-call.js';

/** A machine as the server sends it. */
export type SentMachine = Omit<Machine, 'locationId'>;

/** A machine as the Machines screen lists it: with the name of its shop, and its history. */
export type ListedMachine = Omit<Listed<Machine>, 'locationId'> & { shopName: string };

export type MachineListResult = { ok: true; machines: ListedMachine[] } | Refused;
export type MachineResult = { ok: true; machine: SentMachine } | Refused;

/** The shop's machines, the server PC first. */
export async function listMachines(address: string, pass: SessionPass, options: CallOptions): Promise<MachineListResult> {
  const answer = await call(address, pass, options, { path: MachinesPath }, MachineListReply);
  return answer.ok ? { ok: true, machines: answer.reply.machines } : answer;
}

/** Renames a machine, or switches it off or on. The server checks the name; switched off, its sign-ins end. */
export async function changeMachine(
  address: string,
  pass: SessionPass,
  id: string,
  details: { name: string; status: string },
  options: CallOptions,
): Promise<MachineResult> {
  const body = { name: details.name, status: details.status as MachineDetails['status'] };
  const answer = await call(address, pass, options, { path: machinePath(id), method: 'PUT', body }, MachineReply);
  return answer.ok ? { ok: true, machine: answer.reply.machine } : answer;
}
