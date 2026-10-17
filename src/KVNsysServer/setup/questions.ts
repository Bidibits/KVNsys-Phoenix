/** Asks things on a new install's first start. The console provides one, the setup file another, tests a third. */
export interface Questions {
  ask(prompt: string): Promise<string>;
  /** Like ask, but what's typed doesn't show: for passwords. */
  askSecret(prompt: string): Promise<string>;
}

/** Thrown when there's no answer to give: the input ended, or nobody is there to answer. */
export class NoAnswer extends Error {
  constructor() {
    super('The input ended before every question was answered.');
    this.name = 'NoAnswer';
  }
}
