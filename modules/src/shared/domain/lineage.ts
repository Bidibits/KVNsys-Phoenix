/**
 * Who did something, on which machine, at which location. Stamped on every row written
 * (the created_* and updated_* columns). Null means "not applicable": a seeded row has no
 * user, because nobody was signed in.
 */
export interface Lineage {
  userId: string | null;
  machineId: string | null;
  locationId: string | null;
}
