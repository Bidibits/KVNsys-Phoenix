import { z } from 'zod';

/**
 * Who made a record and who changed it last, by name (KVNsysCore's RecordHistory). Every list sends
 * it with each row; a reply about one record doesn't.
 */
export const RecordHistoryOnWire = z.object({
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  createdMachine: z.string().nullable(),
  createdShop: z.string().nullable(),
  updatedAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
  updatedMachine: z.string().nullable(),
  updatedShop: z.string().nullable(),
});
export type RecordHistoryOnWire = z.infer<typeof RecordHistoryOnWire>;

/** A record as a list sends it: the record, and its history. */
export const listed = <Shape extends z.ZodRawShape>(record: z.ZodObject<Shape>) => record.extend({ history: RecordHistoryOnWire });
