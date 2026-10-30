import { PassThrough } from 'node:stream';
import {
  answersFrom,
  consoleQuestions,
  DefaultAdminUsername,
  FirstShopCode,
  NoAnswer,
  setUpFirstShop,
  type InstallSeed,
  type Questions,
  type SeedInput,
} from '@kvnsys/server';
import { describe, expect, it } from 'vitest';

const server = { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' };

/** Answers the questions in order, and remembers what was asked. */
function answering(...answers: string[]): Questions & { asked: string[] } {
  const asked: string[] = [];
  const next = async (prompt: string) => {
    asked.push(prompt);
    const answer = answers.shift();
    if (answer === undefined) throw new NoAnswer();
    return answer;
  };
  return { asked, ask: next, askSecret: next };
}

/** A seed that only remembers what it was asked to set up. */
function recordingSeed() {
  const runs: SeedInput[] = [];
  const seed = { run: async (input: SeedInput) => (runs.push(input), { created: [], unchanged: [] }) } as unknown as InstallSeed;
  return { seed, runs };
}

describe('setUpFirstShop', () => {
  it("asks for the shop's name and the first administrator's username and password, then sets them up", async () => {
    const { seed, runs } = recordingSeed();
    const said: string[] = [];
    const questions = answering('  Kenly Lucena ', ' Kenly ', 'a-good-password', 'a-good-password');
    await setUpFirstShop(seed, questions, server, (line) => said.push(line));
    expect(runs).toEqual([
      {
        locationCode: FirstShopCode,
        locationName: 'Kenly Lucena',
        adminUsername: 'kenly',
        adminPassword: 'a-good-password',
        server,
      },
    ]);
    expect(questions.asked).toHaveLength(4);
    // The password question and the last line name the username as it will be typed at sign-in.
    expect(questions.asked[2]).toContain('"kenly"');
    expect(said).toContain('Set up Kenly Lucena. On a register, sign in as "kenly" with that password.');
  });

  it('offers admin as the username, and says so, when none is typed', async () => {
    const { seed, runs } = recordingSeed();
    const questions = answering('Kenly Lucena', '', 'a-good-password', 'a-good-password');
    await setUpFirstShop(seed, questions, server, () => {});
    expect(questions.asked[1]).toContain(`"${DefaultAdminUsername}"`);
    expect(runs[0]).toMatchObject({ adminUsername: DefaultAdminUsername });
  });

  it('asks again for a missing name, a username with a space, a short password, and a password typed differently the second time', async () => {
    const { seed, runs } = recordingSeed();
    const said: string[] = [];
    await setUpFirstShop(
      seed,
      answering('', 'Kenly Lucena', 'kenly lucena', 'kenly', 'short', 'a-good-password', 'a-good-pasword', 'a-good-password', 'a-good-password'),
      server,
      (line) => said.push(line),
    );
    expect(runs[0]).toMatchObject({ locationName: 'Kenly Lucena', adminUsername: 'kenly', adminPassword: 'a-good-password' });
    expect(said).toEqual(
      expect.arrayContaining([
        "Type the shop's name, the way people know it.",
        'A username is letters, numbers, dots, dashes or underscores, with no spaces.',
        'A password needs at least 8 characters.',
        "Those didn't match. Once more.",
      ]),
    );
  });

  it('sets up nothing when the answers run out', async () => {
    const { seed, runs } = recordingSeed();
    await expect(setUpFirstShop(seed, answering('Kenly Lucena', 'kenly'), server, () => {})).rejects.toBeInstanceOf(NoAnswer);
    expect(runs).toEqual([]);
  });
});

describe('consoleQuestions, reading answers from a pipe', () => {
  it('takes one line per answer, even when they all arrive at once', async () => {
    const input = new PassThrough();
    const questions = consoleQuestions(input as unknown as NodeJS.ReadStream, new PassThrough() as unknown as NodeJS.WriteStream);
    input.end('Kenly Lucena\na-good-password\na-good-password\n');
    expect(await questions.ask('Name: ')).toBe('Kenly Lucena');
    expect(await questions.askSecret('Password: ')).toBe('a-good-password');
    expect(await questions.askSecret('Again: ')).toBe('a-good-password');
    await expect(questions.ask('More: ')).rejects.toBeInstanceOf(NoAnswer);
    questions.close();
  });
});

describe('answersFrom, for the setup file to give the answers ahead of time', () => {
  const given = { KVNSYS_LOCATION_NAME: ' Kenly Lucena ', KVNSYS_ADMIN_USERNAME: ' Kenly ', KVNSYS_ADMIN_PASSWORD: 'a-good-password' };

  it("answers with the shop's name, the username and the password it's given", async () => {
    const answers = answersFrom(given);
    if (!answers.ok) throw new Error(answers.message);
    const { seed, runs } = recordingSeed();
    await setUpFirstShop(seed, answers.questions, server, () => {});
    expect(runs[0]).toMatchObject({ locationName: 'Kenly Lucena', adminUsername: 'kenly', adminPassword: 'a-good-password' });
  });

  it('says what is missing instead of setting anything up', () => {
    for (const missing of ['KVNSYS_LOCATION_NAME', 'KVNSYS_ADMIN_USERNAME', 'KVNSYS_ADMIN_PASSWORD'] as const) {
      expect(answersFrom({ ...given, [missing]: '' })).toMatchObject({ ok: false, message: expect.stringContaining(missing) });
    }
  });

  it('turns down a username or a password the rules would refuse, with the rule', () => {
    expect(answersFrom({ ...given, KVNSYS_ADMIN_USERNAME: 'kenly lucena' })).toEqual({
      ok: false,
      message: 'KVNSYS_ADMIN_USERNAME: A username is letters, numbers, dots, dashes or underscores, with no spaces.',
    });
    expect(answersFrom({ ...given, KVNSYS_ADMIN_PASSWORD: 'short' })).toEqual({
      ok: false,
      message: 'KVNSYS_ADMIN_PASSWORD: A password needs at least 8 characters.',
    });
  });
});
