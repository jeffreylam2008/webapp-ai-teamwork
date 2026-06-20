/**
 * Client-safe helpers for product images (no Node Buffer required).
 * DB BLOBs may store either raw JPEG/PNG bytes OR a base64 ASCII string as bytes — both are supported.
 */

export function looksLikeBase64Ascii(s: string): boolean {
  const t = s.replace(/\s+/g, '');
  return t.length >= 32 && /^[A-Za-z0-9+/]+=*$/.test(t);
}

export function isBinaryJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function isBinaryPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x47 && bytes[3] === 0x4e;
}

/** Encode raw image bytes to base64 (browser). */
function binaryBytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Convert DB bytes to raw base64 for data URLs.
 * - Binary JPEG/PNG → standard base64 encode
 * - UTF-8 bytes of an existing base64 string → return as-is (no double encoding)
 */
export function bytesToImageBase64(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return null;

  if (isBinaryJpeg(bytes) || isBinaryPng(bytes)) {
    return binaryBytesToBase64(bytes);
  }

  const utf8 = new TextDecoder().decode(bytes).trim();
  if (!utf8) return null;
  if (utf8.startsWith('data:')) {
    const comma = utf8.indexOf(',');
    return comma >= 0 ? utf8.slice(comma + 1).replace(/\s+/g, '') : null;
  }
  if (looksLikeBase64Ascii(utf8)) {
    return utf8.replace(/\s+/g, '');
  }

  return null;
}

export function imageBodyToBase64(imageBody: unknown): string | null {
  if (imageBody == null) return null;
  if (
    typeof imageBody === 'object' &&
    imageBody !== null &&
    'type' in imageBody &&
    (imageBody as { type: string }).type === 'Buffer' &&
    Array.isArray((imageBody as { data?: unknown }).data)
  ) {
    const data = (imageBody as unknown as { data: number[] }).data;
    return bytesToImageBase64(new Uint8Array(data));
  }
  if (typeof imageBody === 'string') {
    const s = imageBody.trim();
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
  return null;
}

export function mimeFromImageFileName(name: string | null | undefined): string {
  const n = (name || '').toLowerCase();
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}

export function mimeFromBase64(b64: string): string {
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64.startsWith('/9j/') || b64.startsWith('/9j')) return 'image/jpeg';
  return 'image/jpeg';
}

/** Build a data URL from DB image_body (raw base64, data URL, or serialized Buffer JSON). */
export function imageBodyToDataUrl(
  imageBody: unknown,
  imageName?: string | null
): string | null {
  const b64 = imageBodyToBase64(imageBody);
  if (!b64) return null;
  const mime = mimeFromBase64(b64) || mimeFromImageFileName(imageName);
  return `data:${mime};base64,${b64}`;
}

export function hasItemImage(imageBody: unknown): boolean {
  return imageBodyToBase64(imageBody) != null;
}
