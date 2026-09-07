/**
 * Pure pixel helpers for eraser + paint-bucket on IMAGE layers.
 */

export type Rgba = [number, number, number, number];

/** OpenPencil ImageScaleMode values we handle for pointer → pixel mapping. */
export type ImageScaleMode = 'FILL' | 'FIT' | 'CROP' | 'TILE' | string;

export interface ImageTransform2x3 {
  m00: number;
  m01: number;
  m02: number;
  m10: number;
  m11: number;
  m12: number;
}

/** Identity crop transform → stretch image to node (1:1 UV). */
export const IDENTITY_IMAGE_TRANSFORM: ImageTransform2x3 = {
  m00: 1,
  m01: 0,
  m02: 0,
  m10: 0,
  m11: 1,
  m12: 0,
};

/**
 * Map normalized node UV [0,1]² to image pixel coords, matching OpenPencil
 * `makeImageFillLocalMatrix` for FILL / FIT / CROP(identity).
 */
export function mapNodeUvToImagePixel(
  u: number,
  v: number,
  imgW: number,
  imgH: number,
  nodeW: number,
  nodeH: number,
  scaleMode: ImageScaleMode = 'FILL',
  imageTransform?: ImageTransform2x3 | null,
): { px: number; py: number; inside: boolean } {
  const nw = Math.max(1e-6, nodeW);
  const nh = Math.max(1e-6, nodeH);
  const iw = Math.max(1, imgW);
  const ih = Math.max(1, imgH);

  let sx: number;
  let sy: number;
  let sw: number;
  let sh: number;

  if (scaleMode === 'CROP' && imageTransform) {
    // CROP: img = Scale(img) · T · Scale(1/node) · dst  (see fills.js)
    // ⇒ image-normalized = T · node-UV
    const t = imageTransform;
    const ix = t.m00 * u + t.m01 * v + t.m02;
    const iy = t.m10 * u + t.m11 * v + t.m12;
    const px = Math.floor(ix * iw);
    const py = Math.floor(iy * ih);
    return {
      px,
      py,
      inside: u >= 0 && v >= 0 && u < 1 && v < 1 && px >= 0 && py >= 0 && px < iw && py < ih,
    };
  }

  if (scaleMode === 'FIT') {
    const scale = Math.min(nw / iw, nh / ih);
    sw = iw;
    sh = ih;
    sx = -(nw / scale - iw) / 2;
    sy = -(nh / scale - ih) / 2;
  } else {
    // FILL (cover) — also the fallback for CROP without transform / TILE.
    const scale = Math.max(nw / iw, nh / ih);
    sw = nw / scale;
    sh = nh / scale;
    sx = (iw - sw) / 2;
    sy = (ih - sh) / 2;
  }

  const px = Math.floor(sx + u * sw);
  const py = Math.floor(sy + v * sh);
  const inNode = u >= 0 && v >= 0 && u < 1 && v < 1;
  const inImg = px >= 0 && py >= 0 && px < iw && py < ih;
  // FIT letterbox: node UV in [0,1] but image sample may fall outside
  return { px, py, inside: inNode && inImg };
}

/** Build an IMAGE fill that stretches 1:1 with node UV (safe for pixel tools). */
export function makeStretchImageFill(imageHash: string): {
  type: 'IMAGE';
  imageHash: string;
  imageScaleMode: 'CROP';
  imageTransform: ImageTransform2x3;
  color: { r: number; g: number; b: number; a: number };
  opacity: number;
  visible: boolean;
} {
  return {
    type: 'IMAGE',
    imageHash,
    imageScaleMode: 'CROP',
    imageTransform: { ...IDENTITY_IMAGE_TRANSFORM },
    color: { r: 0, g: 0, b: 0, a: 0 },
    opacity: 1,
    visible: true,
  };
}

/**
 * Replace the IMAGE fill that matches `targetHash` (or the first IMAGE fill).
 * Leaves other fills untouched.
 */
export function replaceImageFillHash(
  fills: Array<Record<string, unknown>>,
  targetHash: string,
  newHash: string,
  preferStretch = true,
): Array<Record<string, unknown>> {
  const list = fills.length ? [...fills] : [];
  const matchIdx = list.findIndex(
    (f) => f?.type === 'IMAGE' && (f.imageHash === targetHash || (!targetHash && f.imageHash)),
  );
  const idx = matchIdx >= 0 ? matchIdx : list.findIndex((f) => f?.type === 'IMAGE');

  const nextFill = preferStretch
    ? {
        ...makeStretchImageFill(newHash),
        opacity: (idx >= 0 ? (list[idx]!.opacity as number | undefined) : undefined) ?? 1,
        visible: (idx >= 0 ? (list[idx]!.visible as boolean | undefined) : undefined) ?? true,
      }
    : {
        ...(idx >= 0 ? list[idx]! : {}),
        type: 'IMAGE',
        imageHash: newHash,
      };

  if (idx >= 0) {
    const out = [...list];
    out[idx] = nextFill;
    return out;
  }
  return [...list, nextFill];
}

export function colorDistance(a: Rgba, b: Rgba): number {
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
    Math.abs(a[3] - b[3]),
  );
}

export function readPixel(data: Uint8ClampedArray, width: number, x: number, y: number): Rgba {
  const i = (y * width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

export function writePixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  rgba: Rgba,
): void {
  const i = (y * width + x) * 4;
  data[i] = rgba[0];
  data[i + 1] = rgba[1];
  data[i + 2] = rgba[2];
  data[i + 3] = rgba[3];
}

/** Soft/hard circular erase (sets alpha toward 0). */
export function eraseCircle(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): void {
  const r = Math.max(1, radius);
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(height - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      // Hard edge with slight AA at rim
      const edge = Math.sqrt(d2) / r;
      const fade = edge > 0.85 ? (1 - edge) / 0.15 : 1;
      const i = (y * width + x) * 4;
      data[i + 3] = Math.round(data[i + 3] * (1 - fade));
    }
  }
}

/** Seed flood fill with per-channel tolerance (Paint.NET–style). */
export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sx: number,
  sy: number,
  fill: Rgba,
  tolerance = 32,
): number {
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return 0;
  const target = readPixel(data, width, sx, sy);
  if (colorDistance(target, fill) <= tolerance) return 0;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [sx, sy];
  let painted = 0;

  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const px = readPixel(data, width, x, y);
    if (colorDistance(px, target) > tolerance) continue;
    writePixel(data, width, x, y, fill);
    painted++;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  return painted;
}

export function hexToRgba(hex: string, alpha = 255): Rgba {
  const h = hex.replace('#', '').trim();
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const n = parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0, 0, 0, alpha];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

export async function decodeImageBytes(bytes: Uint8Array): Promise<ImageData> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'image/png' });
  const bmp = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 2D 上下文');
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    bmp.close();
  }
}

export async function encodeImageDataPng(imageData: ImageData): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 2D 上下文');
  ctx.putImageData(imageData, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Create a fully transparent PNG of the given size. */
export async function createTransparentPng(width: number, height: number): Promise<Uint8Array> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 2D 上下文');
  ctx.clearRect(0, 0, w, h);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}
