import { passwordProblem, type PcIdentity } from '@kvnsys/core';
import type { InstallSeed } from './install-seed.js';

/** Asks things in the server's window. The console provides the real one; tests provide the answers. */
export interface Questions {
  ask(prompt: string): Promise<string>;
  /** Like ask, but what's typed doesn't show: for passwords. */
  askSecret(prompt: string): Promise<string>;
}

/** Every server set up this way is the shop with code HQ, as `pnpm seed` does, until a second shop needs its own. */
export const FirstShopCode = 'HQ';
export const FirstAdminUsername = 'admin';

/**
 * A brand-new install's first start: asks for the shop's name and a password for the first
 * administrator, then sets them up. It's only asked while nobody can sign in, so it's asked once.
 */
export async function setUpFirstShop(
  seed: InstallSeed,
  questions: Questions,
  server: PcIdentity,
  say: (line: string) => void,
): Promise<void> {
  say('');
  say('KVNsys Server is starting for the first time. It needs two answers, just this once.');

  let shopName = '';
  while (!shopName) {
    shopName = (await questions.ask("The shop's name: ")).trim();
    if (!shopName) say("Type the shop's name, the way people know it.");
  }

  let password: string | undefined;
  while (password === undefined) {
    const typed = await questions.askSecret(`A password for the first administrator, "${FirstAdminUsername}": `);
    const problem = passwordProblem(typed);
    if (problem) {
      say(problem);
    } else if ((await questions.askSecret('Type it again: ')) !== typed) {
      // A typo here would lock the shop out: there's no other administrator to reset it.
      say("Those didn't match. Once more.");
    } else {
      password = typed;
    }
  }

  await seed.run({
    locationCode: FirstShopCode,
    locationName: shopName,
    adminUsername: FirstAdminUsername,
    adminPassword: password,
    server,
  });
  say(`Set up ${shopName}. On a register, sign in as "${FirstAdminUsername}" with that password.`);
  say('');
}
