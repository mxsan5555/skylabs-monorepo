/**
 * Client-side compression for the media-upload system — a phone/camera photo can be several MB,
 * so we shrink it into the backend's 30KB–80KB window before ever sending it (the backend
 * re-validates the final size regardless — this is UX only, never the security boundary).
 * Iteratively lowers JPEG quality, then canvas dimensions, until the blob lands in range.
 */
export class ImageCompressionError extends Error {}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new ImageCompressionError('Could not read this image file.'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function compressImageToRange(
  file: File,
  minBytes = 30 * 1024,
  maxBytes = 80 * 1024,
): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageCompressionError('Image compression is not supported in this browser.');

  let width = img.naturalWidth;
  let height = img.naturalHeight;
  let lastBlob: Blob | null = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // First pass tries decreasing quality at full size; once quality bottoms out, start
    // shrinking dimensions too — a very detailed source image may not compress enough on
    // quality alone.
    const quality = Math.max(0.9 - attempt * 0.08, 0.15);
    const blob = await canvasToBlob(canvas, quality);
    if (!blob) throw new ImageCompressionError('Could not compress this image.');
    lastBlob = blob;

    if (blob.size <= maxBytes && blob.size >= minBytes) return blob;
    if (blob.size > maxBytes) {
      width = Math.round(width * 0.85);
      height = Math.round(height * 0.85);
    } else {
      // Already below the floor at full quality — a very small/simple source image. Nothing
      // more to do; surface this as a real, explained failure rather than silently uploading
      // an under-sized file the backend will reject anyway.
      break;
    }
  }

  if (lastBlob && lastBlob.size < minBytes) {
    throw new ImageCompressionError(
      'This image is too simple/small to reach the required 30 KB minimum — try a different photo.',
    );
  }
  throw new ImageCompressionError('Could not compress this image into the required 30 KB–80 KB range.');
}
