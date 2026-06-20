/**
 * Parse a fetch Response body as JSON; surface HTML/404 bodies as readable errors.
 */
export async function parseJsonResponse<T = Record<string, unknown>>(
  response: Response
): Promise<T> {
  const rawText = await response.text();
  if (!rawText.trim()) {
    throw new Error(
      response.ok ? 'Empty response from server' : `Server error (${response.status})`
    );
  }
  try {
    return JSON.parse(rawText) as T;
  } catch {
    const preview = rawText.slice(0, 120).replace(/\s+/g, ' ').trim();
    throw new Error(
      response.ok
        ? 'Invalid response from server'
        : `Server error (${response.status})${preview ? `: ${preview}` : ''}`
    );
  }
}
