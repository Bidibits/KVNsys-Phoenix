// `pnpm start:server`: starts KVNsys Server on this PC, reachable from the shop's network.
import { networkInterfaces } from 'node:os';
import { checkDatabase, createPrismaClient } from '@kvnsys/postgres';
import { DefaultPort } from '@kvnsys/wire';
import { createServer } from './http/create-server.js';

const port = Number(process.env.KVNSYS_PORT ?? DefaultPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`KVNSYS_PORT must be a whole number from 1 to 65535, not "${process.env.KVNSYS_PORT}".`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
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
  console.error(advice[check.problem]);
  process.exit(1);
}

const app = await createServer({ databaseUrl });
try {
  // 0.0.0.0, not localhost: the registers are other PCs on the shop's network.
  await app.listen(port, '0.0.0.0');
} catch (error) {
  await app.close();
  if ((error as { code?: string }).code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Is KVNsys Server already running on this PC?`);
    process.exit(1);
  }
  throw error;
}

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a !== undefined && a.family === 'IPv4' && !a.internal)
  .map((a) => a!.address);

console.log(`KVNsys Server is running on port ${port}, connected to its database.`);
for (const address of addresses) {
  console.log(`  Other PCs on this network can reach it at http://${address}:${port}`);
}
console.log('Press Ctrl+C to stop it.');
