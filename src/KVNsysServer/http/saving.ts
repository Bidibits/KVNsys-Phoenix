import { Refusal, type Lineage, type RefusalKind } from '@kvnsys/core';
import type { SessionRegister } from '../identity/sessions.js';
import type { SignedInPerson } from '../identity/sign-in.js';
import { problem } from './problems.js';

const StatusFor: Record<RefusalKind, number> = { invalid: 400, unauthenticated: 401, forbidden: 403, 'not-found': 404, conflict: 409 };

/** A refusal from the rules or the store becomes the matching status, with its message. */
export async function saving<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Refusal) throw problem(StatusFor[error.kind], error.message);
    throw error;
  }
}

/** Who saved it, at which register, and so at which shop. A sign-in at no register says neither. */
export function lineageOf(person: SignedInPerson, register: SessionRegister | null): Lineage {
  return { userId: person.id, machineId: register?.machineId ?? null, locationId: register?.locationId ?? null };
}
