import { bytesToImageBase64, looksLikeBase64Ascii } from '@/lib/itemImageDisplay';

/**
 * Server-side limits so encoded images fit typical MySQL max_allowed_packet (4 MB default).
 * Client resize should keep payloads smaller; these are a safety net.
 */
export const MAX_ITEM_IMAGE_BINARY_BYTES = 1_200_000;
export const MAX_ITEM_IMAGE_BASE64_CHARS = 1_600_000;

export function encodeItemImageBuffer(
  buf: Buffer,
  fileName: string | null
): { image_name: string | null; image_body: string } {
  if (buf.length > MAX_ITEM_IMAGE_BINARY_BYTES) {
    throw new Error('IMAGE_FILE_TOO_LARGE');
  }
  const image_body = buf.toString('base64');
  if (image_body.length > MAX_ITEM_IMAGE_BASE64_CHARS) {
    throw new Error('IMAGE_FILE_TOO_LARGE');
  }
  return { image_name: fileName?.trim() || null, image_body };
}

export function isMaxAllowedPacketError(message: string | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes('max_allowed_packet') || lower.includes('packet bigger');
}

/** Normalize DB image_body (BLOB Buffer, base64 string, or data URL) to raw base64 for JSON APIs. */
export function normalizeItemImageBody(value: unknown): string | null {
  if (value == null) return null;
  if (Buffer.isBuffer(value)) {
    return bytesToImageBase64(new Uint8Array(value));
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value as { type: string }).type === 'Buffer' &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    const data = (value as unknown as { data: number[] }).data;
    return bytesToImageBase64(new Uint8Array(data));
  }
  const s = String(value).trim();
  if (!s) return null;
  if (s.startsWith('data:')) {
    const comma = s.indexOf(',');
    return comma >= 0 ? s.slice(comma + 1).replace(/\s+/g, '') : null;
  }
  if (looksLikeBase64Ascii(s)) {
    return s.replace(/\s+/g, '');
  }
  return null;
}
