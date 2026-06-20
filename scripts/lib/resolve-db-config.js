/**
 * Shared with src/lib/db-credential-utils.ts — keep masking rules in sync.
 */
function isMaskedDbCredential(value) {
  if (value == null) return true;
  const s = String(value).trim();
  if (!s) return true;
  if (/^[*•x\-]+$/i.test(s)) return true;
  const lower = s.toLowerCase();
  if (lower === '<masked>' || lower === 'from_env' || lower === 'env') return true;
  return false;
}

function resolveDbCredential(fromJson, fromEnv) {
  if (!isMaskedDbCredential(fromJson)) {
    return String(fromJson).trim();
  }
  const envVal = fromEnv != null ? String(fromEnv).trim() : '';
  if (envVal) return envVal;
  return String(fromJson ?? '').trim();
}

/**
 * @param {Record<string, unknown>} dbConfig parsed db-config.json
 */
function resolveDbConfig(dbConfig) {
  const env = process.env;
  const portRaw = env.DB_PORT?.trim();
  const portParsed = portRaw ? Number.parseInt(portRaw, 10) : NaN;

  return {
    ...dbConfig,
    host: (env.DB_HOST && env.DB_HOST.trim()) || dbConfig.host,
    port: Number.isFinite(portParsed) ? portParsed : dbConfig.port || 3306,
    user: resolveDbCredential(dbConfig.user, env.DB_USER),
    password: resolveDbCredential(dbConfig.password, env.DB_PASSWORD),
    database: (env.DB_NAME && env.DB_NAME.trim()) || dbConfig.database,
  };
}

module.exports = {
  isMaskedDbCredential,
  resolveDbCredential,
  resolveDbConfig,
};
