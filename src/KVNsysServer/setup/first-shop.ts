import { passwordProblem, type PcIdentity } from '@kvnsys/core';
import type { InstallSeed } from './install-seed.js';
import { NoAnswer, type Questions } from './questions.js';

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

/**
 * The two first-start answers, given ahead of time: the shop's name in KVNSYS_LOCATION_NAME and the
 * administrator's password in KVNSYS_ADMIN_PASSWORD, the same names `pnpm seed` reads. The server's
 * setup file fills them in from its own page. Each answer is given once. Asked again means it was
 * refused, and asking forever helps nobody, so it says why instead.
 */
export function answersFrom(env: NodeJS.ProcessEnv): { ok: true; questions: Questions } | { ok: false; message: string } {
  const shopName = env.KVNSYS_LOCATION_NAME?.trim();
  const password = env.KVNSYS_ADMIN_PASSWORD;
  if (!shopName || !password) {
    return { ok: false, message: "Setting up a new install needs the shop's name (KVNSYS_LOCATION_NAME) and an administrator's password (KVNSYS_ADMIN_PASSWORD)." };
  }
  const problem = passwordProblem(password);
  if (problem) return { ok: false, message: `KVNSYS_ADMIN_PASSWORD: ${problem}` };
  let named = 0;
  let typed = 0;
  return {
    ok: true,
    questions: {
      ask: async () => {
        if (named++ > 0) throw new NoAnswer();
        return shopName;
      },
      // Twice: once, then once more to confirm.
      askSecret: async () => {
        if (typed++ > 1) throw new NoAnswer();
        return password;
      },
    },
  };
}
