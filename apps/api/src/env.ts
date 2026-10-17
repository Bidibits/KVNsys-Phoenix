import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

/**
 * Loads the workspace .env (Phoenix/.env). Imported first by every entry point, so the
 * settings are in place before anything reads them. Values already in the environment
 * win, which is how tests point the app at the test database.
 */
config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
