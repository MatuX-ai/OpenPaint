/**
 * Apply palette / gradient presets onto the OpenPencil selection.
 */

import type { Editor } from '@open-pencil/core/editor';
import { useCanvasStore } from '@stores/canvasStore';
import { hexToRgba01, withFillStyle } from '@utils/vectorStroke';
import type { GradientPreset, Palette } from '@/types/asset';
import { syncOpenPencilStateToCanvasStore } from '@composables/useOpenPencil';

function sync(editor: Editor): void {
  syncOpenPencilStateToCanvasStore(editor);
  editor.requestRepaint();
}

/** Apply a solid fill color to all styleable selected nodes. */
export function applySolidFillToSelection(editor: Editor, hex: string): number {
  const store = useCanvasStore();
  store.setFillColor(hex);
  store.setFillEnabled(true);
  let n = 0;
  for (const node of editor.getSelectedNodes()) {
    if (node.type === 'PAGE') continue;
    const fills = (node as { fills?: unknown[] }).fills as never;
    const next = withFillStyle(fills as never, hex, true);
    editor.updateNodeWithUndo(node.id, { fills: next } as never, '填充颜色');
    n += 1;
  }
  if (n > 0) sync(editor);
  return n;
}

export function applyPaletteToSelection(
  editor: Editor,
  palette: Palette,
  mode: 'swatch_bar' | 'replace_color',
  replaceHex?: string,
): { applied: number; colors: string[] } {
  if (mode === 'replace_color' && replaceHex) {
    const applied = applySolidFillToSelection(editor, replaceHex);
    return { applied, colors: [replaceHex] };
  }
  const colors = palette.colors.map((c) => c.hex).filter(Boolean);
  if (colors.length === 0) return { applied: 0, colors: [] };
  // Swatch bar: paint selected nodes with cycling palette colors.
  const selected = editor.getSelectedNodes().filter((n) => n.type !== 'PAGE');
  if (selected.length === 0) {
    // No selection — park first color in prefs for next draw.
    const store = useCanvasStore();
    store.setFillColor(colors[0]!);
    store.setBrushColor(colors[0]!);
    store.setStrokeColor(colors[Math.min(1, colors.length - 1)]!);
    return { applied: 0, colors };
  }
  let i = 0;
  for (const node of selected) {
    const hex = colors[i % colors.length]!;
    i += 1;
    const fills = (node as { fills?: unknown[] }).fills as never;
    const next = withFillStyle(fills as never, hex, true);
    editor.updateNodeWithUndo(node.id, { fills: next } as never, '调色板');
  }
  sync(editor);
  return { applied: selected.length, colors };
}

function gradientType(
  g: GradientPreset,
): 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' {
  if (g.type === 'radial') return 'GRADIENT_RADIAL';
  if (g.type === 'conic') return 'GRADIENT_ANGULAR';
  return 'GRADIENT_LINEAR';
}

/** Identity 2×3 transform for OP gradient fills. */
const IDENTITY_TRANSFORM = [
  [1, 0, 0],
  [0, 1, 0],
] as const;

export function applyGradientToSelection(
  editor: Editor,
  gradient: GradientPreset,
  opacity = 1,
): number {
  const stops = gradient.stops.map((s) => ({
    position: s.offset,
    color: hexToRgba01(s.hex),
  }));
  if (stops.length < 2) return 0;
  const fill = {
    type: gradientType(gradient),
    opacity,
    visible: true,
    gradientStops: stops,
    gradientTransform: IDENTITY_TRANSFORM,
  };
  let n = 0;
  const selected = editor.getSelectedNodes().filter((n) => n.type !== 'PAGE');
  if (selected.length === 0) {
    // Create a frame with the gradient so the user sees something.
    const { panX, panY, zoom } = editor.state;
    const z = zoom || 1;
    const cx = (-panX + 640) / z;
    const cy = (-panY + 360) / z;
    const id = editor.createShape(
      'RECTANGLE',
      cx - 160,
      cy - 100,
      320,
      200,
      undefined,
      gradient.nameZh || '渐变',
    );
    editor.updateNodeWithUndo(id, { fills: [fill] } as never, '渐变填充');
    editor.select([id]);
    sync(editor);
    return 1;
  }
  for (const node of selected) {
    editor.updateNodeWithUndo(node.id, { fills: [fill] } as never, '渐变填充');
    n += 1;
  }
  sync(editor);
  return n;
}
