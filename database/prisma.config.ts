import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// One .env for the whole workspace, at the Phoenix root.
config({ path: '../.env', quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
