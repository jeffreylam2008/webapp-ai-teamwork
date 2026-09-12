import fs from 'fs';
import path from 'path';

const ENV_FILE = '.env.local';
const REQUIRED_ENV_VARS = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;

export type ApplicationEnvStatus = {
  ok: boolean;
  locked: boolean;
  message: string;
  missingFile?: boolean;
  missingVars?: string[];
};

export function getEnvLocalPath(): string {
  return path.join(process.cwd(), ENV_FILE);
}

export function isEnvLocalPresent(): boolean {
  try {
    return fs.existsSync(getEnvLocalPath());
  } catch {
    return false;
  }
}

export function getMissingRequiredEnvVars(): string[] {
  return REQUIRED_ENV_VARS.filter((key) => {
    if (key === 'DB_PASSWORD') return process.env.DB_PASSWORD === undefined;
    return !process.env[key]?.trim();
  });
}

/** Server-only: verify `.env.local` exists and required DB_* vars are loaded. */
export function getApplicationEnvStatus(): ApplicationEnvStatus {
  if (!isEnvLocalPresent()) {
    return {
      ok: false,
      locked: true,
      missingFile: true,
      message:
        'Application locked: `.env.local` was not found. Create it in the project root with DB_USER, DB_PASSWORD, DB_NAME, DB_HOST, and DB_PORT.',
    };
  }

  const missingVars = getMissingRequiredEnvVars();
  if (missingVars.length > 0) {
    return {
      ok: false,
      locked: true,
      missingVars,
      message: `Application locked: missing required variables in \`.env.local\`: ${missingVars.join(', ')}.`,
    };
  }

  return {
    ok: true,
    locked: false,
    message: 'OK',
  };
}

export function assertApplicationEnvConfigured(): void {
  const status = getApplicationEnvStatus();
  if (!status.ok) {
    throw new Error(status.message);
  }
}
