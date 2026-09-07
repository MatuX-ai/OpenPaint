/**
 * Vector fill / stroke helpers for OpenPencil nodes.
 */

export interface Rgba01 {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface StrokeLike {
  color?: Rgba01;
  weight?: number;
  opacity?: number;
  visible?: boolean;
  align?: string;
}

export interface FillLike {
  type?: string;
  color?: Rgba01;
  opacity?: number;
  visible?: boolean;
}

/** Parse #rgb / #rrggbb into OpenPencil 0–1 RGBA. */
export function hexToRgba01(hex: string, alpha = 1): Rgba01 {
  const raw = hex.trim().replace(/^#/, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw.padEnd(6, '0').slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0, a: alpha };
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
    a: alpha,
  };
}

export function rgba01ToHex(color: Rgba01 | undefined | null): string {
  if (!color) return '#000000';
  const r = Math.round(Math.min(1, Math.max(0, color.r)) * 255);
  const g = Math.round(Math.min(1, Math.max(0, color.g)) * 255);
  const b = Math.round(Math.min(1, Math.max(0, color.b)) * 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function makeSolidStroke(colorHex: string, weight: number): StrokeLike {
  return {
    color: hexToRgba01(colorHex),
    weight: Math.max(0.5, weight),
    opacity: 1,
    visible: true,
    align: 'CENTER',
  };
}

export function makeSolidFill(colorHex: string): FillLike {
  return {
    type: 'SOLID',
    color: hexToRgba01(colorHex),
    opacity: 1,
    visible: true,
  };
}

/** Patch first stroke (or create one) with color / weight. */
export function withStrokeStyle(
  strokes: StrokeLike[] | undefined | null,
  colorHex: string,
  weight: number,
): StrokeLike[] {
  const next = makeSolidStroke(colorHex, weight);
  if (!strokes?.length) return [next];
  return strokes.map((s, i) =>
    i === 0
      ? {
          ...s,
          color: next.color,
          weight: next.weight,
          opacity: typeof s.opacity === 'number' ? s.opacity : 1,
          visible: s.visible !== false,
        }
      : s,
  );
}

/** Replace / clear solid fills. */
export function withFillStyle(
  fills: FillLike[] | undefined | null,
  colorHex: string,
  enabled: boolean,
): FillLike[] {
  if (!enabled) return [];
  const next = makeSolidFill(colorHex);
  if (!fills?.length) return [next];
  let replaced = false;
  const out = fills.map((f) => {
    if (replaced) return f;
    if (f?.type && f.type !== 'SOLID') return f;
    replaced = true;
    return {
      ...f,
      type: 'SOLID',
      color: next.color,
      opacity: typeof f.opacity === 'number' ? f.opacity : 1,
      visible: f.visible !== false,
    };
  });
  if (!replaced) out.push(next);
  return out;
}
