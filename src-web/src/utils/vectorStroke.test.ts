import { describe, expect, it } from 'vitest';
import { hexToRgba01, rgba01ToHex, withFillStyle, withStrokeStyle } from './vectorStroke';

describe('vectorStroke', () => {
  it('hexToRgba01 parses #rrggbb', () => {
    expect(hexToRgba01('#ff0000')).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(hexToRgba01('#0f0')).toEqual({ r: 0, g: 1, b: 0, a: 1 });
  });

  it('rgba01ToHex rounds back', () => {
    expect(rgba01ToHex({ r: 1, g: 0, b: 0, a: 1 })).toBe('#ff0000');
  });

  it('withStrokeStyle patches first stroke', () => {
    const next = withStrokeStyle(
      [{ color: { r: 0, g: 0, b: 0, a: 1 }, weight: 2, opacity: 1, visible: true }],
      '#0984e3',
      6,
    );
    expect(next).toHaveLength(1);
    expect(next[0]!.weight).toBe(6);
    expect(next[0]!.color).toEqual(hexToRgba01('#0984e3'));
  });

  it('withFillStyle enables solid fill', () => {
    const next = withFillStyle([], '#d63031', true);
    expect(next).toHaveLength(1);
    expect(next[0]!.type).toBe('SOLID');
    expect(next[0]!.color).toEqual(hexToRgba01('#d63031'));
  });

  it('withFillStyle clears when disabled', () => {
    expect(withFillStyle([{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }], '#000', false)).toEqual(
      [],
    );
  });
});
