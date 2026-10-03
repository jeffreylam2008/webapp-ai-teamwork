/**
 * Resolve app origin for API test scripts.
 *
 * Priority:
 *   1. --base-url / -u (cliBaseUrl)
 *   2. BASE_URL or APP_URL
 *   3. http://{HOST}:{PORT} from --port / PORT / APP_PORT (HOST defaults to localhost)
 *
 * No default port is assumed — caller must supply one of the above.
 */

function normalizeBaseUrl(raw) {
  const url = String(raw || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    return `http://${url}`;
  }
  return url;
}

/**
 * @param {{ cliBaseUrl?: string, cliPort?: string|number }} [opts]
 * @returns {{ baseUrl: string|null, source: string }}
 */
function resolveBaseUrl(opts = {}) {
  const cliBaseUrl = normalizeBaseUrl(opts.cliBaseUrl);
  if (cliBaseUrl) {
    return { baseUrl: cliBaseUrl, source: '--base-url' };
  }

  const envUrl = normalizeBaseUrl(process.env.BASE_URL || process.env.APP_URL);
  if (envUrl) {
    return { baseUrl: envUrl, source: process.env.BASE_URL ? 'BASE_URL' : 'APP_URL' };
  }

  const portRaw = opts.cliPort != null && String(opts.cliPort).trim() !== ''
    ? opts.cliPort
    : process.env.PORT || process.env.APP_PORT;
  const port = Number.parseInt(String(portRaw || ''), 10);
  if (Number.isFinite(port) && port > 0) {
    const host = String(process.env.HOST || process.env.APP_HOST || 'localhost').trim() || 'localhost';
    const source = opts.cliPort != null && String(opts.cliPort).trim() !== '' ? '--port' : 'PORT';
    return { baseUrl: `http://${host}:${port}`, source };
  }

  return { baseUrl: null, source: '' };
}

function baseUrlHelpText() {
  return `  --base-url, -u    App origin, e.g. http://localhost:3000 (or BASE_URL / APP_URL)
  --port, -p        Port only; builds http://localhost:<port> (or PORT / APP_PORT)
                    HOST / APP_HOST overrides the hostname (default localhost)`;
}

function missingBaseUrlMessage() {
  return [
    'Error: app URL is required. Specify one of:',
    '  --base-url http://localhost:3000',
    '  --port 3000',
    '  BASE_URL / APP_URL / PORT in .env.local',
  ].join('\n');
}

module.exports = {
  normalizeBaseUrl,
  resolveBaseUrl,
  baseUrlHelpText,
  missingBaseUrlMessage,
};
