// Starts KVNsys Server on this PC, reachable from the shop's network: `pnpm start:server` from
// source, or double-clicking KVNsys Server.exe.
import { networkInterfaces } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { isSea } from 'node:sea';
import { checkDatabase, createPrismaClient } from '@kvnsys/postgres';
import { DefaultPort } from '@kvnsys/wire';
import { createServer } from './http/create-server.js';
import { defaultServerDataDir, loadOrCreateServerCertificate } from './security/server-certificate.js';
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

  // Refuse to start without a working database, rather than failing at the first sign-in.
  const probe = createPrismaClient(databaseUrl);
  const check = await checkDatabase(probe);
  await probe.$disconnect();
  if (!check.ok) {
    const advice: Record<typeof check.problem, string> = {
      unreachable: `Can't reach the database: ${check.detail}\nCheck DATABASE_URL, and that PostgreSQL is running.`,
      'not-set-up': 'That database has no KVNsys tables yet. Run `pnpm db:deploy`, then `pnpm seed`.',
      'out-of-date': `That database is missing KVNsys updates (${check.detail}). Run \`pnpm db:deploy\`.`,
      unrecognised:
        `That database has updates this server doesn't recognise (${check.detail}). ` +
        'It may belong to another program, or to a newer KVNsys Server. Check DATABASE_URL.',
    };
    return stop(advice[check.problem]);
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
