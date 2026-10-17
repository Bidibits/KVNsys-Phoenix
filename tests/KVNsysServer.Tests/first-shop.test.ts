import { PassThrough } from 'node:stream';
import {
  answersFrom,
  consoleQuestions,
  FirstAdminUsername,
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
  it("asks for the shop's name and a password, then sets them up", async () => {
    const { seed, runs } = recordingSeed();
    const questions = answering('  Kenly Lucena ', 'a-good-password', 'a-good-password');
    await setUpFirstShop(seed, questions, server, () => {});
    expect(runs).toEqual([
      {
        locationCode: FirstShopCode,
        locationName: 'Kenly Lucena',
        adminUsername: FirstAdminUsername,
        adminPassword: 'a-good-password',
        server,
      },
    ]);
    expect(questions.asked).toHaveLength(3);
  });

  it('asks again for a missing name, a short password, and a password typed differently the second time', async () => {
    const { seed, runs } = recordingSeed();
    const said: string[] = [];
    await setUpFirstShop(
      seed,
      answering('', 'Kenly Lucena', 'short', 'a-good-password', 'a-good-pasword', 'a-good-password', 'a-good-password'),
      server,
      (line) => said.push(line),
    );
    expect(runs[0]).toMatchObject({ locationName: 'Kenly Lucena', adminPassword: 'a-good-password' });
    expect(said).toEqual(
      expect.arrayContaining([
        "Type the shop's name, the way people know it.",
        'A password needs at least 8 characters.',
        "Those didn't match. Once more.",
      ]),
    );
  });

  it('sets up nothing when the answers run out', async () => {
    const { seed, runs } = recordingSeed();
    await expect(setUpFirstShop(seed, answering('Kenly Lucena'), server, () => {})).rejects.toBeInstanceOf(NoAnswer);
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
  it("answers with the shop's name and the password it's given", async () => {
    const answers = answersFrom({ KVNSYS_LOCATION_NAME: ' Kenly Lucena ', KVNSYS_ADMIN_PASSWORD: 'a-good-password' });
    if (!answers.ok) throw new Error(answers.message);
    const { seed, runs } = recordingSeed();
    await setUpFirstShop(seed, answers.questions, server, () => {});
    expect(runs[0]).toMatchObject({ locationName: 'Kenly Lucena', adminPassword: 'a-good-password', adminUsername: FirstAdminUsername });
  });

  it('says what is missing instead of setting anything up', () => {
    expect(answersFrom({ KVNSYS_ADMIN_PASSWORD: 'a-good-password' })).toMatchObject({ ok: false, message: expect.stringMatching(/KVNSYS_LOCATION_NAME/) });
    expect(answersFrom({ KVNSYS_LOCATION_NAME: 'Kenly Lucena' })).toMatchObject({ ok: false, message: expect.stringMatching(/KVNSYS_ADMIN_PASSWORD/) });
  });

  it('turns down a password too short to be allowed, with the rule', () => {
    expect(answersFrom({ KVNSYS_LOCATION_NAME: 'Kenly Lucena', KVNSYS_ADMIN_PASSWORD: 'short' })).toEqual({
      ok: false,
      message: 'KVNSYS_ADMIN_PASSWORD: A password needs at least 8 characters.',
    });
  });
});
