/**
 * Treat placeholder values in db-config.json as "use env instead".
 * Committed config should use ******** for user/password; set DB_USER and DB_PASSWORD.
 */
export function isMaskedDbCredential(value: unknown): boolean {
  if (value == null) return true;
  const s = String(value).trim();
  if (!s) return true;
  if (/^[*•x\-]+$/i.test(s)) return true;
  const lower = s.toLowerCase();
  if (lower === '<masked>' || lower === 'from_env' || lower === 'env') return true;
  return false;
}

export function resolveDbCredential(fromJson: string, fromEnv: string | undefined): string {
  if (!isMaskedDbCredential(fromJson)) {
    return fromJson.trim();
  }
  const envVal = fromEnv?.trim();
  if (envVal) return envVal;
  return fromJson.trim();
}

/** Safe copy for logs/API — never expose real credentials */
export function maskDbConfigForDisplay<T extends Record<string, unknown>>(
  config: T
): T & { user: string; password: string } {
  return {
    ...config,
    user: '********',
    password: '********',
  };
}
