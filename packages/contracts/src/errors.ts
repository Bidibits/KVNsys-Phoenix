import { z } from 'zod';

/** Every refusal the API sends has this shape, so a screen can always show `message`. */
export const ApiError = z.object({
  statusCode: z.number(),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;
