import dbConfig from '@/data/db-config.json';
import { isMaskedDbCredential, resolveDbCredential } from '@/lib/db-credential-utils';

export type AppDbConfig = typeof dbConfig;

/**
 * Merge `src/data/db-config.json` with optional process env.
 * User/password in JSON may be masked (`********`); real values come from `DB_USER` / `DB_PASSWORD`.
 * Also supports `DB_HOST`, `DB_PORT`, and `DB_NAME` overrides.
 */
export function getResolvedDbConfig(): AppDbConfig {
  const env = process.env;
  const portRaw = env.DB_PORT?.trim();
  const portParsed = portRaw ? Number.parseInt(portRaw, 10) : NaN;

  const user = resolveDbCredential(dbConfig.user, env.DB_USER);
  const password = resolveDbCredential(dbConfig.password, env.DB_PASSWORD);

  const host = env.DB_HOST?.trim() || dbConfig.host;
  const database = env.DB_NAME?.trim() || dbConfig.database;
  const port = Number.isFinite(portParsed) ? portParsed : dbConfig.port;

  if (isMaskedDbCredential(dbConfig.user) && !env.DB_USER?.trim()) {
    console.warn(
      '[db-config] DB user is masked in db-config.json; set DB_USER in the environment.'
    );
  }
  if (isMaskedDbCredential(dbConfig.password) && env.DB_PASSWORD === undefined) {
    console.warn(
      '[db-config] DB password is masked in db-config.json; set DB_PASSWORD in the environment.'
    );
  }

  return {
    ...dbConfig,
    host,
    port,
    user,
    password,
    database,
  };
}

export const resolvedDbConfig = getResolvedDbConfig();
