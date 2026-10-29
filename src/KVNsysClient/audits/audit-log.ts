import { AuditListReply, auditsPath, type AuditEntryOnWire, type AuditQuery, type SessionPass } from '@kvnsys/wire';
import { callServer as call, type CallOptions, type Refused } from '../connection/server-call.js';

/** One change, as the Audit log screen shows it. */
export type AuditLine = AuditEntryOnWire;

/** What the screen asks for: each part as picked or typed, empty for any. */
export type AuditFilterForm = AuditQuery;

export type AuditListResult =
  | {
      ok: true;
      entries: AuditLine[];
      more: boolean;
      people: { id: string; name: string }[];
      byKVNsys: boolean;
      tables: { name: string; label: string }[];
    }
  | Refused;

/** The newest changes that match, newest first; the server checks the filters and the right. */
export async function listAudits(address: string, pass: SessionPass, filter: AuditFilterForm, options: CallOptions): Promise<AuditListResult> {
  const answer = await call(address, pass, options, { path: auditsPath(filter) }, AuditListReply);
  return answer.ok ? { ok: true, ...answer.reply } : answer;
}
