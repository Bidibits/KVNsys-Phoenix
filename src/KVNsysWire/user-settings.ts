import { z } from 'zod';

/**
 * The signed-in person's own settings for how the screens look (see KVNsysCore's user-settings.ts):
 * so far, the widths they dragged each list's columns to. Both calls need a signed-in pass and no
 * right: the settings are the person's own, and change nothing of the business's.
 *
 *   GET  /api/my-settings    the person's settings; none changed yet reads as an empty one
 *   PUT  /api/my-settings    keeps these in place of what was kept; the reply is them as kept
 *
 * A refusal is a ProblemReply (see products.ts).
 */
export const MySettingsPath = '/api/my-settings';

export const UserSettingsOnWire = z.object({
  /** Per list (its name), per column (its heading): a width such as "8.5em". */
  columnWidths: z.record(z.string(), z.record(z.string(), z.string())),
});
export type UserSettingsOnWire = z.infer<typeof UserSettingsOnWire>;

export const MySettingsReply = z.object({ settings: UserSettingsOnWire });
export type MySettingsReply = z.infer<typeof MySettingsReply>;
