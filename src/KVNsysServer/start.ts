// Starts KVNsys Server on this PC, reachable from the shop's network: `pnpm start:server` from
// source, or double-clicking KVNsys Server.exe.
import { networkInterfaces } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { isSea } from 'node:sea';
import { applyDatabaseUpdates, checkDatabase, createPrismaClient, isEmptyDatabase, PrismaSetupStore } from '@kvnsys/postgres';
import { DefaultPort } from '@kvnsys/wire';
import { createServer } from './http/create-server.js';
import { ScryptPasswordHasher } from './identity/scrypt-password-hasher.js';
import { defaultServerDataDir, loadOrCreateServerCertificate } from './security/server-certificate.js';
import { consoleQuestions, NoAnswer } from './setup/console-questions.js';
import { setUpFirstShop } from './setup/first-shop.js';
import { InstallSeed } from './setup/install-seed.js';
import { readPcIdentity } from './setup/server-identity.js';
import { loadServerSettings } from './setup/server-settings.js';

async function main(): Promise<void> {
  // The server's own folder: its certificate, and its settings file.
  const dataDir = process.env.KVNSYS_SERVER_DATA || defaultServerDataDir();
  const settings = loadServerSettings(dataDir);

  const port = Number(process.env.KVNSYS_PORT ?? DefaultPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return stop(`KVNSYS_PORT must be a whole number from 1 to 65535, not "${process.env.KVNSYS_PORT}".`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return stop(
      "KVNsys Server doesn't know where its database is.\n" +
        `Put a line like DATABASE_URL=postgresql://user:password@localhost:5432/kvnsys in\n  ${settings.file}\n` +
        "(When running from source, Phoenix's .env works too.)",
    );
  }

  // Refuse to start without a working database, rather than failing at the first sign-in. An
  // empty one gets set up here, so a new install needs no pnpm.
  const db = createPrismaClient(databaseUrl);
  try {
    let check = await checkDatabase(db);
    if (!check.ok && check.problem === 'not-set-up' && (await isEmptyDatabase(databaseUrl))) {
      console.log('The database is empty, so KVNsys Server is setting it up.');
      try {
        const applied = await applyDatabaseUpdates(databaseUrl);
        console.log(`  Applied ${applied.length} database ${applied.length === 1 ? 'update' : 'updates'}.`);
      } catch (error) {
        return stop(error instanceof Error ? error.message : String(error));
      }
      check = await checkDatabase(db);
    }
    if (!check.ok) {
      const advice: Record<typeof check.problem, string> = {
        unreachable: `Can't reach the database: ${check.detail}\nCheck DATABASE_URL, and that PostgreSQL is running.`,
        'not-set-up':
          "That database already has tables in it, and they aren't KVNsys's: it may belong to another program.\n" +
          'Give KVNsys Server an empty database of its own, or check DATABASE_URL.',
        'out-of-date': `That database is missing KVNsys updates (${check.detail}). Run \`pnpm db:deploy\`.`,
        unrecognised:
          `That database has updates this server doesn't recognise (${check.detail}). ` +
          'It may belong to another program, or to a newer KVNsys Server. Check DATABASE_URL.',
      };
      return stop(advice[check.problem]);
    }

    // A brand-new install has nobody who could sign in yet, so it asks, once, for what it needs.
    const seed = new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher());
    if (await seed.firstAdministratorNeeded()) {
      const questions = consoleQuestions();
      try {
        await setUpFirstShop(seed, questions, readPcIdentity(), (line) => console.log(line));
      } catch (error) {
        if (!(error instanceof NoAnswer)) throw error;
        return stop(
          'KVNsys Server needs two answers the first time it starts, but nothing can be typed here. ' +
            'Start it from its icon, and answer in its window.',
        );
      } finally {
        questions.close();
      }
    }
  } finally {
    await db.$disconnect();
  }

  // The server's identity for secure connections: made once, then kept, because registers pin it.
  let certificate: Awaited<ReturnType<typeof loadOrCreateServerCertificate>>;
  try {
    certificate = await loadOrCreateServerCertificate(dataDir);
  } catch (error) {
    return stop(error instanceof Error ? error.message : String(error));
  }
  if (certificate.created) console.log(`Made this server's security certificate, in ${dataDir}.`);

  const app = await createServer({ databaseUrl, certificate });
  try {
    // 0.0.0.0, not localhost: the registers are other PCs on the shop's network.
    await app.listen(port, '0.0.0.0');
  } catch (error) {
    await app.close();
    if ((error as { code?: string }).code === 'EADDRINUSE') {
      return stop(`Port ${port} is already in use. Is KVNsys Server already running on this PC?`);
    }
    throw error;
  }

  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((a) => a !== undefined && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address);

  console.log(`KVNsys Server is running on port ${port}, connected to its database.`);
  for (const address of addresses) {
    console.log(`  Other PCs on this network can reach it at https://${address}:${port}`);
  }
  console.log(`  Its certificate fingerprint, for checking a register's first connection:
  ${certificate.fingerprint256}`);
  console.log('Press Ctrl+C, or close this window, to stop it.');
}

/**
 * Says what went wrong and stops. A double-clicked server's window would close before anyone
 * could read why, so the packaged program waits for Enter first.
 */
async function stop(message: string): Promise<never> {
  console.error(message);
  if (isSea()) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    await prompt.question('\nPress Enter to close this window.');
    prompt.close();
  }
  process.exit(1);
}

main().catch((error: unknown) => stop(error instanceof Error ? (error.stack ?? error.message) : String(error)));
