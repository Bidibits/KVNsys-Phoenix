import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// One .env for the whole workspace, at the Phoenix root. Prisma 7 no longer reads .env files
// itself, so this loads it. A value already set in the environment wins.
config({ path: '../../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
