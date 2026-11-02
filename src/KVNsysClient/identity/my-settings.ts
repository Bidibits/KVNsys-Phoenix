import type { UserSettings } from '@kvnsys/core';
import { MySettingsPath, MySettingsReply, type SessionPass } from '@kvnsys/wire';
import { callServer as call, type CallOptions, type Refused } from '../connection/server-call.js';

export type MySettingsResult = { ok: true; settings: UserSettings } | Refused;

/** The signed-in person's own settings, as the server keeps them for them. */
export async function loadMySettings(address: string, pass: SessionPass, options: CallOptions): Promise<MySettingsResult> {
  const answer = await call(address, pass, options, { path: MySettingsPath }, MySettingsReply);
  return answer.ok ? { ok: true, settings: answer.reply.settings } : answer;
}

/** Keeps these as the signed-in person's settings, in place of what the server kept. */
export async function saveMySettings(address: string, pass: SessionPass, settings: UserSettings, options: CallOptions): Promise<MySettingsResult> {
  const answer = await call(address, pass, options, { path: MySettingsPath, method: 'PUT', body: settings }, MySettingsReply);
  return answer.ok ? { ok: true, settings: answer.reply.settings } : answer;
}
