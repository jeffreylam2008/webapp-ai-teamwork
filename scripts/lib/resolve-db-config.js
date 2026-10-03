const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

const REQUIRED_ENV_VARS = ['DB_USER', 'DB_PASSWORD', 'DB_NAME'];

function assertEnvLocalConfigured() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error(
      'Application locked: `.env.local` was not found. Create it in the project root with DB_USER, DB_PASSWORD, DB_NAME, DB_HOST, and DB_PORT.'
    );
    process.exit(1);
  }

  const missing = REQUIRED_ENV_VARS.filter((key) => {
    if (key === 'DB_PASSWORD') return process.env.DB_PASSWORD === undefined;
    return !process.env[key]?.trim();
  });

  if (missing.length > 0) {
    console.error(
      `Application locked: missing required variables in \`.env.local\`: ${missing.join(', ')}.`
    );
    process.exit(1);
  }
}

/**
 * @param {Record<string, unknown>} dbConfig parsed db-config.json (pool settings only)
 */
function resolveDbConfig(dbConfig) {
  assertEnvLocalConfigured();

  const env = process.env;
  const portRaw = env.DB_PORT?.trim();
  const portParsed = portRaw ? Number.parseInt(portRaw, 10) : NaN;

  return {
    ...dbConfig,
    host: (env.DB_HOST && env.DB_HOST.trim()) || dbConfig.host,
    port: Number.isFinite(portParsed) ? portParsed : dbConfig.port || 3306,
    user: env.DB_USER.trim(),
    password: env.DB_PASSWORD,
    database: env.DB_NAME.trim(),
  };
}

module.exports = {
  assertEnvLocalConfigured,
  resolveDbConfig,
};
