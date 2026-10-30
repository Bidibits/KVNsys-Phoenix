import type { RecordHistory } from '@kvnsys/core';

/** Who made a record and who last changed it, as a stand-in server sends it with each row of a list. */
export const history: RecordHistory = {
  createdAt: '2026-10-30T02:00:00.000Z',
  createdBy: 'System Administrator (admin)',
  createdMachine: 'Server',
  createdShop: 'Kenlyn',
  updatedAt: '2026-10-30T03:30:00.000Z',
  updatedBy: 'Ana Santos Cruz (ana)',
  updatedMachine: 'Counter 1',
  updatedShop: 'Kenlyn',
};

/** A record as a list sends it: with its history. A reply about one record has none. */
export const listed = <T extends object>(record: T): T & { history: RecordHistory } => ({ ...record, history });
