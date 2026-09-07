/**
 * rasterPixels unit tests — flood fill + erase circle + UV / fill helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  colorDistance,
  eraseCircle,
  floodFill,
  hexToRgba,
  makeStretchImageFill,
  mapNodeUvToImagePixel,
  readPixel,
  replaceImageFillHash,
  writePixel,
  IDENTITY_IMAGE_TRANSFORM,
} from './rasterPixels';

function make(
  w: number,
  h: number,
  fill: [number, number, number, number] = [255, 0, 0, 255],
): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = fill[0];
    data[i * 4 + 1] = fill[1];
    data[i * 4 + 2] = fill[2];
    data[i * 4 + 3] = fill[3];
  }
  return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
}

describe('rasterPixels', () => {
  it('hexToRgba parses #rrggbb', () => {
    expect(hexToRgba('#6c5ce7')).toEqual([108, 92, 231, 255]);
    expect(hexToRgba('#fff', 128)).toEqual([255, 255, 255, 128]);
  });

  it('floodFill paints connected region', () => {
    const img = make(5, 5, [255, 0, 0, 255]);
    writePixel(img.data, 5, 4, 4, [0, 255, 0, 255]);
    const n = floodFill(img.data, 5, 5, 0, 0, [0, 0, 255, 255], 0);
    expect(n).toBe(24);
    expect(readPixel(img.data, 5, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(readPixel(img.data, 5, 4, 4)).toEqual([0, 255, 0, 255]);
  });

  it('eraseCircle reduces alpha near center', () => {
    const img = make(10, 10, [0, 0, 0, 255]);
    eraseCircle(img.data, 10, 10, 5, 5, 3);
    expect(readPixel(img.data, 10, 5, 5)[3]).toBeLessThan(255);
  });

  it('colorDistance is chebyshev', () => {
    expect(colorDistance([0, 0, 0, 0], [10, 2, 3, 4])).toBe(10);
  });
});

describe('mapNodeUvToImagePixel', () => {
  it('CROP + identity stretches 1:1', () => {
    const p = mapNodeUvToImagePixel(0.5, 0.25, 100, 80, 200, 160, 'CROP', IDENTITY_IMAGE_TRANSFORM);
    expect(p.inside).toBe(true);
    expect(p.px).toBe(50);
    expect(p.py).toBe(20);
  });

  it('FILL covers and crops when aspect differs', () => {
    const mid = mapNodeUvToImagePixel(0.5, 0.5, 100, 100, 100, 50, 'FILL');
    expect(mid.inside).toBe(true);
    expect(mid.px).toBe(50);
    expect(mid.py).toBe(50);
    const top = mapNodeUvToImagePixel(0, 0, 100, 100, 100, 50, 'FILL');
    expect(top.py).toBe(25);
  });

  it('FIT letterbox marks outside image as not inside', () => {
    const corner = mapNodeUvToImagePixel(0, 0.5, 50, 50, 100, 50, 'FIT');
    expect(corner.inside).toBe(false);
  });
});

describe('replaceImageFillHash', () => {
  it('replaces matching IMAGE fill only', () => {
    const fills = [
      { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } },
      { type: 'IMAGE', imageHash: 'old', imageScaleMode: 'FILL' },
      { type: 'IMAGE', imageHash: 'other' },
    ];
    const next = replaceImageFillHash(fills, 'old', 'new', true);
    expect(next[0]).toEqual(fills[0]);
    expect(next[1]).toMatchObject({
      type: 'IMAGE',
      imageHash: 'new',
      imageScaleMode: 'CROP',
    });
    expect(next[2]).toEqual(fills[2]);
  });

  it('makeStretchImageFill uses CROP identity', () => {
    const f = makeStretchImageFill('h1');
    expect(f.imageScaleMode).toBe('CROP');
    expect(f.imageTransform).toEqual(IDENTITY_IMAGE_TRANSFORM);
  });
});
