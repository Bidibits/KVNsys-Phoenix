import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// One .env for the whole workspace, at the Phoenix root. Prisma 7 no longer reads .env files
// itself, so this loads it. A value already set in the environment wins.
config({ path: '../../.env', quiet: true });

const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Only when set. Prisma's env() helper refuses to load the config at all without it, and
  // that would break `prisma generate`, which never touches a database. Commands that do,
  // such as `migrate deploy`, still stop and say the address is missing.
  ...(url ? { datasource: { url } } : {}),
});
