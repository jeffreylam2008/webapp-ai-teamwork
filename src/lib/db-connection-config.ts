import 'server-only';
import dbConfig from '@/data/db-config.json';
import { getMissingRequiredEnvVars, isEnvLocalPresent } from '@/lib/env-config.server';

export type DbPoolConfig = typeof dbConfig;

export type AppDbConfig = DbPoolConfig & {
  user: string;
  password: string;
  database: string;
};

/**
 * Pool settings from `src/data/db-config.json`.
 * Credentials (user, password, database) must come from `.env.local` only.
 */
export function tryGetResolvedDbConfig(): AppDbConfig | null {
  if (!isEnvLocalPresent()) return null;

  const missing = getMissingRequiredEnvVars();
  if (missing.length > 0) return null;

  const env = process.env;
  const portRaw = env.DB_PORT?.trim();
  const portParsed = portRaw ? Number.parseInt(portRaw, 10) : NaN;

  return {
    ...dbConfig,
    host: env.DB_HOST?.trim() || dbConfig.host,
    port: Number.isFinite(portParsed) ? portParsed : dbConfig.port,
    user: env.DB_USER!.trim(),
    password: env.DB_PASSWORD!,
    database: env.DB_NAME!.trim(),
  };
}

export function getResolvedDbConfig(): AppDbConfig {
  const config = tryGetResolvedDbConfig();
  if (!config) {
    if (!isEnvLocalPresent()) {
      throw new Error(
        'Application locked: `.env.local` was not found. Create it in the project root with DB_USER, DB_PASSWORD, and DB_NAME.'
      );
    }
    const missing = getMissingRequiredEnvVars();
    throw new Error(
      `Application locked: missing required variables in \`.env.local\`: ${missing.join(', ')}.`
    );
  }
  return config;
}

export const resolvedDbConfig: AppDbConfig | null = tryGetResolvedDbConfig();
