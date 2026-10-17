/** Server settings, read once from the environment (the workspace .env in development). */
export class PhoenixConfig {
  constructor(
    readonly databaseUrl: string,
    private readonly rawSessionSecret: string | undefined,
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): PhoenixConfig {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    }
    return new PhoenixConfig(databaseUrl, env.PHOENIX_SESSION_SECRET);
  }

  /**
   * Read only by the parts that sign sessions, so a tool that never signs one (the seed)
   * doesn't need it.
   */
  get sessionSecret(): string {
    const secret = this.rawSessionSecret;
    if (!secret || secret.length < 32 || secret.startsWith('CHANGE_ME')) {
      throw new Error('PHOENIX_SESSION_SECRET must be set to a random string of at least 32 characters.');
    }
    return secret;
  }
}
