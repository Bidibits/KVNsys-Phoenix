/**
 * Who did something, on which machine, at which location: the created_* and updated_*
 * columns every row carries. Null means "not applicable". A seeded row has no user,
 * because nobody was signed in.
 */
export interface Lineage {
  userId: string | null;
  machineId: string | null;
  locationId: string | null;
}
