import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Compute a simple Laplacian magnitude map on the luma channel of an ImageData.
 * This approximates high-frequency content / curvature, which is strongly
 * correlated with interpolation error for linear demosaicing.
 */
export function computeLaplacianMagnitude(image: ImageData): Float32Array {
  const { width, height, data } = image;
  const out = new Float32Array(width * height);

  const luma = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      luma[y * width + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }

  const get = (x: number, y: number) => {
    x = Math.max(0, Math.min(width - 1, x));
    y = Math.max(0, Math.min(height - 1, y));
    return luma[y * width + x];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const center = get(x, y);
      const lap =
        -4 * center +
        get(x + 1, y) +
        get(x - 1, y) +
        get(x, y + 1) +
        get(x, y - 1);
      out[y * width + x] = Math.abs(lap);
    }
  }

  return out;
}

/**
 * Normalize a scalar field (Float32Array) to [0, 1] with optional clipping.
 */
export function normalizeScalarField(
  field: Float32Array,
  clipPercent: number = 0.0
): Float32Array {
  const n = field.length;
  if (n === 0) return field;

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = field[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  // Optional percentile clipping for robustness
  if (clipPercent > 0 && clipPercent < 0.5) {
    const sorted = Array.from(field).sort((a, b) => a - b);
    const loIdx = Math.floor(clipPercent * (n - 1));
    const hiIdx = Math.floor((1 - clipPercent) * (n - 1));
    min = sorted[loIdx];
    max = sorted[hiIdx];
  }

  const range = max - min || 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = Math.min(1, Math.max(0, (field[i] - min) / range));
  }
  return out;
}

/**
 * Convert a normalized scalar field [0,1] to a Heatmap ImageData using a
 * perceptually ordered blue→cyan→yellow→red palette.
 */
export function heatmapFromNormalizedField(
  field01: Float32Array,
  width: number,
  height: number
): ImageData {
  const img = new ImageData(width, height);

  const mapColor = (t: number): [number, number, number] => {
    // Simple 4-stop gradient: blue → cyan → yellow → red
    if (t <= 0) return [0, 0, 128];
    if (t >= 1) return [180, 0, 0];

    if (t < 1 / 3) {
      const u = t / (1 / 3);
      // blue (0,0,128) -> cyan (0,255,255)
      return [0, 255 * u, 128 + (255 - 128) * u];
    } else if (t < 2 / 3) {
      const u = (t - 1 / 3) / (1 / 3);
      // cyan (0,255,255) -> yellow (255,255,0)
      return [255 * u, 255, 255 * (1 - u)];
    } else {
      const u = (t - 2 / 3) / (1 / 3);
      // yellow (255,255,0) -> red (180,0,0)
      return [255 - (255 - 180) * u, 255 * (1 - u), 0];
    }
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const t = field01[idx];
      const [r, g, b] = mapColor(t);
      const p = idx * 4;
      img.data[p] = r;
      img.data[p + 1] = g;
      img.data[p + 2] = b;
      img.data[p + 3] = 255;
    }
  }

  return img;
}
