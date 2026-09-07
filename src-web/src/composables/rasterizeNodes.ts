/**
 * Rasterize OpenPencil vector nodes into a single IMAGE-fill rectangle.
 * Lossy: paths / text become pixels.
 */

import { renderNodesToImage, computeContentBounds } from '@open-pencil/core/io';
import type { Editor } from '@open-pencil/core/editor';
import { makeStretchImageFill } from '@utils/rasterPixels';
import { isPageNode } from '@utils/nodeType';

export interface RasterizedLayer {
  nodeId: string;
  imageHash: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function isImageNode(node: { fills?: Array<{ type?: string; imageHash?: string }> }): boolean {
  return Boolean(node.fills?.some((f) => f?.type === 'IMAGE' && f.imageHash));
}

/** True if the node can be edited with pixel tools without conversion. */
export function isPixelEditableNode(node: {
  fills?: Array<{ type?: string; imageHash?: string }>;
  rotation?: number;
}): boolean {
  return isImageNode(node) && (node.rotation ?? 0) === 0;
}

/**
 * Collect vector node ids that need rasterization before pixel editing.
 * Prefers the hit node; falls back to current selection.
 */
export function collectVectorIdsForPixelEdit(editor: Editor, hitId: string | null): string[] {
  if (hitId) {
    const hit = editor.getNode(hitId);
    if (hit && !isPageNode(hit) && !isPixelEditableNode(hit)) {
      return [hitId];
    }
    if (hit && isPixelEditableNode(hit)) return [];
  }

  const selected = editor.getSelectedNodes();
  const vectors = selected
    .filter((n) => !isPageNode(n) && !isPixelEditableNode(n))
    .map((n) => n.id);
  return vectors;
}

export async function rasterizeNodeIds(
  editor: Editor,
  nodeIds: string[],
): Promise<RasterizedLayer | null> {
  const ids = [...new Set(nodeIds)].filter((id) => {
    const n = editor.getNode(id);
    return Boolean(n && !isPageNode(n));
  });
  if (ids.length === 0) return null;

  const renderer = editor.renderer;
  if (!renderer?.ck) {
    throw new Error('画布渲染器未就绪，无法栅格化');
  }

  const bytes = renderNodesToImage(
    renderer.ck,
    renderer,
    editor.graph,
    editor.state.currentPageId,
    ids,
    {
      scale: 1,
      format: 'PNG',
      quality: 100,
      trimTransparent: false,
    },
  );
  if (!bytes || bytes.length === 0) {
    throw new Error('栅格化失败：没有可渲染的内容');
  }

  const bounds = computeContentBounds(editor.graph, ids);
  if (!bounds) {
    throw new Error('栅格化失败：无法计算对象边界');
  }

  const width = Math.max(1, Math.ceil(bounds.maxX - bounds.minX));
  const height = Math.max(1, Math.ceil(bounds.maxY - bounds.minY));
  const x = bounds.minX;
  const y = bounds.minY;

  const first = editor.getNode(ids[0]!);
  const parentId = first?.parentId ?? undefined;
  const name =
    ids.length === 1 ? `${String(first?.name || '对象')}（像素）` : `栅格化选区（${ids.length}）`;

  const hash = editor.storeImage(bytes);
  const newId = editor.createShape('RECTANGLE', x, y, width, height, parentId, name);

  editor.updateNodeWithUndo(
    newId,
    {
      name,
      fills: [makeStretchImageFill(hash)],
      strokes: [],
    } as never,
    '栅格化为像素图',
  );

  // Remove originals (select then delete keeps undo stack coherent when possible)
  editor.select(ids);
  editor.deleteSelected();
  editor.select([newId]);
  editor.requestRepaint();

  const abs = editor.graph.getAbsolutePosition?.(newId) ?? { x, y };
  return {
    nodeId: newId,
    imageHash: hash,
    x: abs.x,
    y: abs.y,
    width,
    height,
  };
}

/**
 * Menu / toolbar entry: rasterize current selection (with caller-provided confirm).
 */
export async function rasterizeCurrentSelection(
  editor: Editor,
  options?: { confirm?: (ids: string[], label: string) => Promise<boolean> },
): Promise<RasterizedLayer | null> {
  const selected = editor.getSelectedNodes().filter((n) => !isPageNode(n));
  if (selected.length === 0) {
    throw new Error('请先选中要转换的对象');
  }

  const alreadyPixel = selected.every((n) => isPixelEditableNode(n));
  if (alreadyPixel) {
    throw new Error('选中对象已是像素图层');
  }

  const vectorIds = selected.filter((n) => !isPixelEditableNode(n)).map((n) => n.id);
  const label =
    vectorIds.length === 1
      ? String(selected.find((n) => n.id === vectorIds[0])?.name || '对象')
      : `${vectorIds.length} 个对象`;

  if (options?.confirm) {
    const ok = await options.confirm(vectorIds, label);
    if (!ok) return null;
  }

  return rasterizeNodeIds(editor, vectorIds);
}
