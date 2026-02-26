export async function downsizeImageToDataURL(
  file: File,
  maxSide: number = 2048,
  quality: number = 0.85
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;

  const longestSide = Math.max(width, height);
  const scale = Math.min(1, maxSide / longestSide);

  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get 2D context for resizing");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  // Release the bitmap to avoid holding GPU memory
  try {
    (bitmap as unknown as { close?: () => void }).close?.();
  } catch {}

  // Always export as JPEG per requirements (quality 0.85 by default)
  return canvas.toDataURL("image/jpeg", quality);
}


