// Starts KVNsys Server on this PC, reachable from the shop's network: `pnpm start:server` from
// source, double-clicking KVNsys Server.exe, or as the Windows service the server's setup installs.
import { createInterface } from 'node:readline/promises';
import { isSea } from 'node:sea';
import {
  applyDatabaseUpdates,
  checkDatabase,
  createDatabaseIfMissing,
  createPrismaClient,
  isEmptyDatabase,
  PrismaSetupStore,
} from '@kvnsys/postgres';
import { DefaultPort } from '@kvnsys/wire';
import { startServerControl } from './control/control-server.js';
import { lanAddresses } from './control/lan-addresses.js';
import { createServer } from './http/create-server.js';
import { ScryptPasswordHasher } from './identity/scrypt-password-hasher.js';
import { loadOrCreateServerCertificate } from './security/server-certificate.js';
import { earlierServerDataDir, serverDataDir } from './setup/server-folder.js';
import { consoleQuestions } from './setup/console-questions.js';
import { answersFrom, setUpFirstShop } from './setup/first-shop.js';
import { InstallSeed } from './setup/install-seed.js';
import { NoAnswer } from './setup/questions.js';
import { readPcIdentity } from './setup/server-identity.js';
import { adoptEarlierServerData, loadServerSettings } from './setup/server-settings.js';

// `KVNsys Server.exe --set-up` is what the server's setup file runs once, with administrator rights.
// It makes and sets up the database. On a new install it takes the shop's name and the administrator's
// password from KVNSYS_LOCATION_NAME and KVNSYS_ADMIN_PASSWORD, which the setup's own page fills in.
// Then it stops without serving: the Windows service does the serving.
const setUpOnly = process.argv.includes('--set-up');

// Someone is at a window that can show a message and wait for Enter. A Windows service has no window,
// and the setup's set-up run is hidden, so waiting in either would hang it for good. Input alone
// doesn't tell: under the service wrapper the input still looks like a console. Output going to a
// console someone can see does tell.
const atAWindow = isSea() && process.stdin.isTTY === true && process.stdout.isTTY === true && !setUpOnly;

async function main(): Promise<void> {
  // The server's own folder: its certificate, its settings file, and the server password.
  const dataDir = serverDataDir();
  if (!process.env.KVNSYS_SERVER_DATA) {
    const moved = adoptEarlierServerData(earlierServerDataDir(), dataDir);
    if (moved.length > 0) console.log(`Brought ${moved.join(', ')} over to ${dataDir}. The originals stay where they were.`);
  }
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

  // A database that doesn't exist yet is created here, empty, and then set up like any empty one.
  try {
    const created = await createDatabaseIfMissing(databaseUrl);
    if (created) console.log(`There was no database called ${created}, so KVNsys Server created it.`);
  } catch (error) {
    return stop(error instanceof Error ? error.message : String(error));
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
    const brandNew = await seed.firstAdministratorNeeded();
    if (brandNew && setUpOnly) {
      const answers = answersFrom(process.env);
      if (!answers.ok) return stop(answers.message);
      await setUpFirstShop(seed, answers.questions, readPcIdentity(), (line) => console.log(line));
    } else if (brandNew) {
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
  if (setUpOnly) {
    console.log('KVNsys Server is set up.');
    process.exit(0);
  }

  // The server's identity for secure connections: made once, then kept, because registers pin it.
  let certificate: Awaited<ReturnType<typeof loadOrCreateServerCertificate>>;
  try {
    certificate = await loadOrCreateServerCertificate(dataDir);
  } catch (error) {
    return stop(error instanceof Error ? error.message : String(error));
  }
  if (certificate.created) console.log(`Made this server's security certificate, in ${dataDir}.`);

  const app = await createServer({ databaseUrl, certificate, dataDir });
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

  // The dashboard's way in, on this PC only. Its key is taken out of the folder on the way out
  // (NestJS handles stopping on those two signals; this only adds to it). A key left behind by a
  // hard stop does no harm: the next run writes a new one, and the old one opens nothing.
  const control = await startServerControl(app, { dataDir, port });
  process.once('exit', control.forgetKey);
  process.once('SIGINT', control.forgetKey);
  process.once('SIGTERM', control.forgetKey);

  console.log(`KVNsys Server is running on port ${port}, connected to its database.`);
  for (const address of lanAddresses()) {
    console.log(`  Other PCs on this network can reach it at https://${address}:${port}`);
  }
  console.log(`  Its certificate fingerprint, for checking a register's first connection:
  ${certificate.fingerprint256}`);
  console.log('Press Ctrl+C, or close this window, to stop it.');
}

/**
 * Says what went wrong and stops. A double-clicked server's window would close before anyone could
 * read why, so at a window the packaged program waits for Enter first. As a service, the message
 * goes to the service's log instead.
 */
async function stop(message: string): Promise<never> {
  console.error(message);
  if (atAWindow) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    await prompt.question('\nPress Enter to close this window.');
    prompt.close();
  }
  process.exit(1);
}

main().catch((error: unknown) => stop(error instanceof Error ? (error.stack ?? error.message) : String(error)));
