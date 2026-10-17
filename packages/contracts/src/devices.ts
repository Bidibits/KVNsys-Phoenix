import { z } from 'zod';

export const LocationOption = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
});
export type LocationOption = z.infer<typeof LocationOption>;

export const MachineSummary = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  location: LocationOption,
});
export type MachineSummary = z.infer<typeof MachineSummary>;

/** What this browser is: a registered register, or not yet. */
export const DeviceStatus = z.discriminatedUnion('registered', [
  z.object({ registered: z.literal(true), machine: MachineSummary }),
  z.object({ registered: z.literal(false) }),
]);
export type DeviceStatus = z.infer<typeof DeviceStatus>;

/** A machine code is what staff type and say out loud, so it is kept short and plain. */
export const MachineCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{0,19}$/, 'Use up to 20 letters, digits or dashes, like HQ-01');

export const RegisterDeviceRequest = z.object({
  locationId: z.string().uuid('Pick a location'),
  code: MachineCode,
  name: z.string().trim().min(1, 'Enter a name, like Front counter 1').max(60),
});
export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequest>;
