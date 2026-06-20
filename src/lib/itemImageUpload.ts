/** Max source file size before client-side resize (5 MB). */
export const MAX_ITEM_IMAGE_SOURCE_BYTES = 5 * 1024 * 1024;

/** Longest edge after resize (keeps DB payload under typical max_allowed_packet). */
export const ITEM_IMAGE_MAX_DIMENSION = 1024;

export const ITEM_IMAGE_JPEG_QUALITY = 0.82;

/**
 * Resize/compress product images in the browser before upload (JPEG, max 1024px).
 */
export async function prepareItemImageFileForUpload(file: File): Promise<File> {
  if (file.size > MAX_ITEM_IMAGE_SOURCE_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const maxDim = ITEM_IMAGE_MAX_DIMENSION;
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('COMPRESS_FAILED');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', ITEM_IMAGE_JPEG_QUALITY);
    });
    if (!blob) {
      throw new Error('COMPRESS_FAILED');
    }

    const baseName = (file.name || 'image').replace(/\.[^.]+$/i, '') || 'image';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
