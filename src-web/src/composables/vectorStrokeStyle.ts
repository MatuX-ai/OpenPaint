/**
 * Apply canvasStore vector style prefs to OpenPencil nodes
 * (create-time + selection editing).
 */

import type { Editor } from '@open-pencil/core/editor';
import { useCanvasStore } from '@stores/canvasStore';
import {
  isShapeDrawTool,
  type ToolType,
} from '@/tools/editorTools';
import {
  rgba01ToHex,
  withFillStyle,
  withStrokeStyle,
  type FillLike,
  type StrokeLike,
} from '@utils/vectorStroke';

type StyleKind = 'stroke' | 'fill-stroke' | 'text';

let pendingKind: StyleKind | null = null;
/** Avoid re-applying (and flooding undo) on every selection:changed. */
let lastStyledSelectionKey = '';

const SHAPE_TYPES = new Set([
  'RECTANGLE',
  'ELLIPSE',
  'LINE',
  'POLYGON',
  'STAR',
  'FRAME',
  'VECTOR',
]);

function styleKindForTool(tool: ToolType): StyleKind | null {
  if (tool === 'pen') return 'stroke';
  if (tool === 'text') return 'text';
  if (isShapeDrawTool(tool)) return 'fill-stroke';
  return null;
}

function selectionKey(editor: Editor): string {
  return editor
    .getSelectedNodes()
    .map((n) => n.id)
    .sort()
    .join(',');
}

/** Call when user activates a create tool or starts drawing. */
export function noteVectorCreateTool(tool: ToolType): void {
  pendingKind = styleKindForTool(tool);
  lastStyledSelectionKey = '';
}

export function notePenDrawingStarted(): void {
  pendingKind = 'stroke';
  lastStyledSelectionKey = '';
}

export function clearPendingPenStrokeApply(): void {
  pendingKind = null;
  lastStyledSelectionKey = '';
}

export function clearPendingStyleApply(): void {
  pendingKind = null;
  lastStyledSelectionKey = '';
}

function isTextNode(node: { type?: string }): boolean {
  return node.type === 'TEXT';
}

function isStyleableShape(node: { type?: string; strokes?: unknown[]; fills?: unknown[] }): boolean {
  if (!node.type || node.type === 'PAGE') return false;
  if (SHAPE_TYPES.has(node.type)) return true;
  return Boolean(node.strokes?.length || node.fills?.length);
}

export function applyStrokeStyleToSelected(editor: Editor): number {
  const store = useCanvasStore();
  let n = 0;
  for (const node of editor.getSelectedNodes()) {
    if (node.type === 'PAGE' || isTextNode(node)) continue;
    const strokes = (node as { strokes?: StrokeLike[] }).strokes;
    const isPathLike =
      node.type === 'VECTOR' ||
      node.type === 'LINE' ||
      Boolean(strokes && strokes.length > 0) ||
      isStyleableShape(node);
    if (!isPathLike) continue;
    if (!store.strokeEnabled && node.type !== 'VECTOR' && node.type !== 'LINE') {
      editor.updateNodeWithUndo(node.id, { strokes: [] } as never, '描边');
      n += 1;
      continue;
    }
    const next = withStrokeStyle(strokes, store.strokeColor, store.strokeWeight);
    editor.updateNodeWithUndo(node.id, { strokes: next } as never, '描边');
    n += 1;
  }
  if (n > 0) editor.requestRepaint();
  return n;
}

export function applyFillStyleToSelected(editor: Editor): number {
  const store = useCanvasStore();
  let n = 0;
  for (const node of editor.getSelectedNodes()) {
    if (node.type === 'PAGE') continue;
    if (node.type === 'VECTOR' && !(node as { fills?: unknown[] }).fills?.length) {
      // Open paths usually have no fill — skip unless user enabled fill.
      if (!store.fillEnabled) continue;
    }
    if (!isStyleableShape(node) && !isTextNode(node)) continue;
    const fills = (node as { fills?: FillLike[] }).fills;
    const next = withFillStyle(fills, store.fillColor, store.fillEnabled);
    editor.updateNodeWithUndo(node.id, { fills: next } as never, '填充');
    n += 1;
  }
  if (n > 0) editor.requestRepaint();
  return n;
}

export function applyTextStyleToSelected(editor: Editor): number {
  const store = useCanvasStore();
  let n = 0;
  for (const node of editor.getSelectedNodes()) {
    if (!isTextNode(node)) continue;
    const fills = (node as { fills?: FillLike[] }).fills;
    const nextFills = withFillStyle(fills, store.fillColor, true);
    editor.updateNodeWithUndo(
      node.id,
      {
        fontSize: store.fontSize,
        fills: nextFills,
      } as never,
      '文字样式',
    );
    n += 1;
  }
  if (n > 0) editor.requestRepaint();
  return n;
}

export function applyShapeExtrasToSelected(editor: Editor): number {
  const store = useCanvasStore();
  let n = 0;
  for (const node of editor.getSelectedNodes()) {
    if (node.type === 'POLYGON') {
      editor.updateNodeWithUndo(
        node.id,
        { pointCount: store.polygonSides } as never,
        '多边形边数',
      );
      n += 1;
    } else if (node.type === 'STAR') {
      editor.updateNodeWithUndo(
        node.id,
        {
          pointCount: store.starPoints,
          starInnerRadius: store.starInnerRadius,
        } as never,
        '星形参数',
      );
      n += 1;
    }
  }
  if (n > 0) editor.requestRepaint();
  return n;
}

/** Full style pass for current selection based on node types. */
export function applyVectorStyleToSelected(editor: Editor): number {
  let n = 0;
  n += applyFillStyleToSelected(editor);
  n += applyStrokeStyleToSelected(editor);
  n += applyTextStyleToSelected(editor);
  n += applyShapeExtrasToSelected(editor);
  return n;
}

/**
 * While a create tool is active, restyle the live preview node as soon as
 * it appears in the selection (OpenPencil selects on pointer-down).
 * Skips when the selection set is unchanged to avoid undo spam.
 */
export function applyStyleForActiveCreateTool(editor: Editor, tool: ToolType): void {
  const kind = styleKindForTool(tool);
  if (!kind) return;
  // Pen: apply on commit via maybeApplyStrokeAfterPenCommit.
  if (kind === 'stroke') return;
  const key = selectionKey(editor);
  if (!key || key === lastStyledSelectionKey) return;
  lastStyledSelectionKey = key;
  if (kind === 'text') {
    applyTextStyleToSelected(editor);
    return;
  }
  applyFillStyleToSelected(editor);
  applyStrokeStyleToSelected(editor);
  applyShapeExtrasToSelected(editor);
}

/** After pen commit (tool → SELECT), apply pending stroke prefs once. */
export function maybeApplyStrokeAfterPenCommit(editor: Editor): void {
  if (pendingKind !== 'stroke') return;
  if (editor.state.penState) return;
  if (editor.state.activeTool !== 'SELECT') return;
  pendingKind = null;
  const selected = editor.getSelectedNodes();
  const hasPath = selected.some(
    (n) =>
      n.type === 'VECTOR' ||
      n.type === 'LINE' ||
      Boolean((n as { strokes?: unknown[] }).strokes?.length),
  );
  if (!hasPath) return;
  applyStrokeStyleToSelected(editor);
}

/** Pull prefs from the first selected node into the store. */
export function syncStrokePrefsFromSelection(editor: Editor): void {
  syncStylePrefsFromSelection(editor);
}

export function syncStylePrefsFromSelection(editor: Editor): void {
  const store = useCanvasStore();
  for (const node of editor.getSelectedNodes()) {
    if (node.type === 'PAGE') continue;
    const fills = (node as { fills?: FillLike[] }).fills;
    const strokes = (node as { strokes?: StrokeLike[] }).strokes;
    const solid = fills?.find((f) => f?.type === 'SOLID' && f.color);
    if (solid?.color) {
      store.setFillColor(rgba01ToHex(solid.color));
      store.setFillEnabled(true);
    } else if (Array.isArray(fills) && fills.length === 0) {
      store.setFillEnabled(false);
    }
    const firstStroke = strokes?.[0];
    if (firstStroke) {
      store.setStrokeEnabled(true);
      if (firstStroke.color) store.setStrokeColor(rgba01ToHex(firstStroke.color));
      if (typeof firstStroke.weight === 'number') store.setStrokeWeight(firstStroke.weight);
    } else if (Array.isArray(strokes) && strokes.length === 0 && node.type !== 'VECTOR') {
      store.setStrokeEnabled(false);
    }
    if (isTextNode(node)) {
      const fs = (node as { fontSize?: number }).fontSize;
      if (typeof fs === 'number' && fs > 0) store.setFontSize(fs);
    }
    if (node.type === 'POLYGON') {
      const pc = (node as { pointCount?: number }).pointCount;
      if (typeof pc === 'number') store.setPolygonSides(pc);
    }
    if (node.type === 'STAR') {
      const pc = (node as { pointCount?: number }).pointCount;
      const inner = (node as { starInnerRadius?: number }).starInnerRadius;
      if (typeof pc === 'number') store.setStarPoints(pc);
      if (typeof inner === 'number') store.setStarInnerRadius(inner);
    }
    return;
  }
}
