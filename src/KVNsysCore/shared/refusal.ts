export type RefusalKind = 'invalid' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict';

/**
 * The system declining to do something, with a message it's safe to show a person.
 * Rules and operations throw this; whatever shows it decides how.
 */
export class Refusal extends Error {
  constructor(
    readonly kind: RefusalKind,
    message: string,
  ) {
    super(message);
    this.name = 'Refusal';
  }
}
