/**
 * Authorization: Bearer … for client fetch() calls to routes that resolve the user via JWT (e.g. audit logs).
 * Pass `token` from `useAuth()`.
 */
export function bearerAuthHeaders(token: string | null | undefined): Record<string, string> {
  const t = token?.trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/**
 * Merge `init` with Bearer (when `token` is set) and `credentials: 'include'` so httpOnly
 * `auth_token` and Bearer both work (middleware + APIs).
 */
export function authedFetchInit(
  token: string | null | undefined,
  init: RequestInit = {}
): RequestInit {
  const t = token?.trim();
  const headers = new Headers(init.headers);
  if (t) headers.set('Authorization', `Bearer ${t}`);
  return { ...init, credentials: 'include', headers };
}

/**
 * `fetch` with session cookie + optional Bearer. Prefer this for protected `/api/*` routes.
 */
export function fetchWithAuth(
  input: string | URL,
  token: string | null | undefined,
  init: RequestInit = {}
): Promise<Response> {
  return fetch(input, authedFetchInit(token, init));
}
