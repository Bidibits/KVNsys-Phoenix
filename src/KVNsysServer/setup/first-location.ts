import { normalizeUsername, passwordProblem, usernameProblem, type PcIdentity } from '@kvnsys/core';
import type { InstallSeed } from './install-seed.js';
import { NoAnswer, type Questions } from './questions.js';

/** Every server set up this way is the location with code HQ, as `pnpm seed` does, until a second location needs its own. */
export const FirstLocationCode = 'HQ';

/** The first account's username when whoever installs doesn't choose another. It's always shown to them. */
export const DefaultAdminUsername = 'admin';

/**
 * A brand-new install's first start: asks for the location's name and for the first administrator's
 * username and password, then sets them up. It's only asked while nobody can sign in, so it's asked
 * once.
 */
export async function setUpFirstLocation(
  seed: InstallSeed,
  questions: Questions,
  server: PcIdentity,
  say: (line: string) => void,
): Promise<void> {
  say('');
  say('KVNsys Server is starting for the first time. It needs three answers, just this once.');

  let locationName = '';
  while (!locationName) {
    locationName = (await questions.ask("The location's name: ")).trim();
    if (!locationName) say("Type the location's name, the way people know it.");
  }

  let username = '';
  while (!username) {
    const typed = (await questions.ask(`A username for the first administrator (Enter for "${DefaultAdminUsername}"): `)).trim();
    const problem = usernameProblem(typed || DefaultAdminUsername);
    if (problem) say(problem);
    else username = normalizeUsername(typed || DefaultAdminUsername);
  }

  let password: string | undefined;
  while (password === undefined) {
    const typed = await questions.askSecret(`A password for "${username}": `);
    const problem = passwordProblem(typed);
    if (problem) {
      say(problem);
    } else if ((await questions.askSecret('Type it again: ')) !== typed) {
      // A typo here would lock the business out: there's no other administrator to reset it.
      say("Those didn't match. Once more.");
    } else {
      password = typed;
    }
  }

  await seed.run({
    locationCode: FirstLocationCode,
    locationName,
    adminUsername: username,
    adminPassword: password,
    server,
  });
  say(`Set up ${locationName}. On any machine, sign in as "${username}" with that password.`);
  say('');
}

/**
 * The three first-start answers, given ahead of time: the location's name in KVNSYS_LOCATION_NAME, and
 * the administrator's username and password in KVNSYS_ADMIN_USERNAME and KVNSYS_ADMIN_PASSWORD, the
 * same names `pnpm seed` reads. The server's setup file fills them in from its own page. Each answer
 * is given once. Asked again means it was refused, and asking forever helps nobody, so it says why
 * instead.
 */
export function answersFrom(env: NodeJS.ProcessEnv): { ok: true; questions: Questions } | { ok: false; message: string } {
  const locationName = env.KVNSYS_LOCATION_NAME?.trim();
  const username = env.KVNSYS_ADMIN_USERNAME?.trim();
  const password = env.KVNSYS_ADMIN_PASSWORD;
  if (!locationName || !username || !password) {
    return {
      ok: false,
      message:
        "Setting up a new install needs the location's name (KVNSYS_LOCATION_NAME), and a username and password for the first " +
        'administrator (KVNSYS_ADMIN_USERNAME and KVNSYS_ADMIN_PASSWORD).',
    };
  }
  const usernameIssue = usernameProblem(username);
  if (usernameIssue) return { ok: false, message: `KVNSYS_ADMIN_USERNAME: ${usernameIssue}` };
  const passwordIssue = passwordProblem(password);
  if (passwordIssue) return { ok: false, message: `KVNSYS_ADMIN_PASSWORD: ${passwordIssue}` };
  // In the order setUpFirstLocation asks: the location's name, then the username.
  const named = [locationName, username];
  let typed = 0;
  return {
    ok: true,
    questions: {
      ask: async () => {
        const answer = named.shift();
        if (answer === undefined) throw new NoAnswer();
        return answer;
      },
      // Twice: once, then once more to confirm.
      askSecret: async () => {
        if (typed++ > 1) throw new NoAnswer();
        return password;
      },
    },
  };
}
