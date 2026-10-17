import { v7 } from 'uuid';

/**
 * A new row id: UUID v7, made by whichever machine creates the row, with no coordination.
 * Two machines that never talk can't produce the same one, which is what lets a branch
 * create rows while HQ is unreachable. Ids sort by creation time.
 */
export function newId(): string {
  return v7();
}
