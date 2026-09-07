/**
 * Layer operations against the OpenPencil scene graph.
 *
 * OpenPaint's LayerPanel treats page top-level nodes (depth === 0) as layers.
 * All mutations go through the editor so undo / selection / render stay in sync.
 */

import type { Editor } from '@open-pencil/core/editor';
import { syncOpenPencilStateToCanvasStore } from '@composables/useOpenPencil';
import type { BlendMode } from '@/types/canvas';

export type LayerOpResult = { ok: true } | { ok: false; message: string };

function sync(editor: Editor): void {
  syncOpenPencilStateToCanvasStore(editor);
  editor.requestRepaint();
}

function topLevelIds(editor: Editor): string[] {
  return editor
    .getLayerTree()
    .filter((e) => (e.depth ?? 0) === 0)
    .map((e) => e.node.id)
    .filter(Boolean);
}

function pageIdFor(editor: Editor, nodeId: string): string {
  const node = editor.graph?.getNode?.(nodeId) as { parentId?: string | null } | undefined;
  return node?.parentId ?? editor.state.currentPageId;
}

function toOpBlend(mode: BlendMode): string {
  return mode.toUpperCase();
}

export function selectLayer(editor: Editor, layerId: string): LayerOpResult {
  if (!layerId) return { ok: false, message: '无效图层' };
  editor.select([layerId]);
  sync(editor);
  return { ok: true };
}

export function addLayer(editor: Editor, name?: string): LayerOpResult & { id?: string } {
  const label = name?.trim() || `图层 ${topLevelIds(editor).length + 1}`;
  const center = (() => {
    const canvas = document.querySelector(
      '.openpencil-view canvas, .main-layout__canvas canvas, canvas',
    ) as HTMLCanvasElement | null;
    const vw = canvas?.clientWidth || 1280;
    const vh = canvas?.clientHeight || 720;
    const { panX, panY, zoom } = editor.state;
    const z = zoom || 1;
    return { x: (-panX + vw / 2) / z, y: (-panY + vh / 2) / z };
  })();
  const w = 800;
  const h = 600;
  const id = editor.createShape(
    'FRAME',
    center.x - w / 2,
    center.y - h / 2,
    w,
    h,
    undefined,
    label,
  );
  editor.select([id]);
  sync(editor);
  return { ok: true, id };
}

export function deleteLayer(editor: Editor, layerId: string): LayerOpResult {
  const ids = topLevelIds(editor);
  if (ids.length <= 1) return { ok: false, message: '至少保留一个图层' };
  if (!ids.includes(layerId)) return { ok: false, message: '图层不存在' };
  editor.select([layerId]);
  editor.deleteSelected();
  sync(editor);
  return { ok: true };
}

export function deleteActiveLayer(editor: Editor, activeId: string | null): LayerOpResult {
  const ids = topLevelIds(editor);
  const target = activeId && ids.includes(activeId) ? activeId : ids[ids.length - 1];
  if (!target) return { ok: false, message: '没有可删除的图层' };
  return deleteLayer(editor, target);
}

export function duplicateLayer(editor: Editor, layerId: string): LayerOpResult {
  const ids = topLevelIds(editor);
  if (!ids.includes(layerId)) return { ok: false, message: '图层不存在' };
  editor.select([layerId]);
  editor.duplicateSelected();
  sync(editor);
  return { ok: true };
}

export function renameLayer(editor: Editor, layerId: string, name: string): LayerOpResult {
  const next = name.trim();
  if (!next) return { ok: false, message: '名称不能为空' };
  if (!topLevelIds(editor).includes(layerId)) return { ok: false, message: '图层不存在' };
  editor.renameNode(layerId, next);
  sync(editor);
  return { ok: true };
}

export function setLayerVisible(editor: Editor, layerId: string, visible: boolean): LayerOpResult {
  editor.updateNodeWithUndo(layerId, { visible } as never, visible ? '显示图层' : '隐藏图层');
  sync(editor);
  return { ok: true };
}

export function setLayerLocked(editor: Editor, layerId: string, locked: boolean): LayerOpResult {
  editor.updateNodeWithUndo(layerId, { locked } as never, locked ? '锁定图层' : '解锁图层');
  sync(editor);
  return { ok: true };
}

export function setLayerOpacity(editor: Editor, layerId: string, opacity: number): LayerOpResult {
  const o = Math.max(0, Math.min(1, opacity));
  editor.updateNodeWithUndo(layerId, { opacity: o } as never, '图层不透明度');
  sync(editor);
  return { ok: true };
}

export function setLayerBlendMode(editor: Editor, layerId: string, mode: BlendMode): LayerOpResult {
  editor.updateNodeWithUndo(layerId, { blendMode: toOpBlend(mode) } as never, '图层混合模式');
  sync(editor);
  return { ok: true };
}

export function rotateLayer(editor: Editor, layerId: string, degrees: number): LayerOpResult {
  editor.select([layerId]);
  editor.rotateNodes([layerId], degrees);
  sync(editor);
  return { ok: true };
}

/**
 * Reorder a top-level layer.
 * `displayIndex` is the index in the UI list (top-most first).
 */
export function reorderLayer(editor: Editor, layerId: string, displayIndex: number): LayerOpResult {
  const bottomToTop = topLevelIds(editor);
  if (!bottomToTop.includes(layerId)) return { ok: false, message: '图层不存在' };
  const topToBottom = [...bottomToTop].reverse();
  const from = topToBottom.indexOf(layerId);
  if (from < 0) return { ok: false, message: '图层不存在' };
  const to = Math.max(0, Math.min(topToBottom.length - 1, Math.round(displayIndex)));
  if (from === to) return { ok: true };

  topToBottom.splice(from, 1);
  topToBottom.splice(to, 0, layerId);
  const newBottomToTop = [...topToBottom].reverse();
  const insertIndex = newBottomToTop.indexOf(layerId);
  const parentId = pageIdFor(editor, layerId);
  editor.reorderChildWithUndo(layerId, parentId, insertIndex);
  sync(editor);
  return { ok: true };
}

/** Merge `layerId` down into the visually lower neighbor (group). */
export function mergeDown(editor: Editor, layerId: string): LayerOpResult {
  const bottomToTop = topLevelIds(editor);
  const idx = bottomToTop.indexOf(layerId);
  if (idx < 0) return { ok: false, message: '图层不存在' };
  if (idx === 0) return { ok: false, message: '已是最底层，无法向下合并' };
  const belowId = bottomToTop[idx - 1]!;
  const below = editor.graph?.getNode?.(belowId) as { name?: string } | undefined;
  editor.select([layerId, belowId]);
  const groupId = editor.groupSelected();
  if (!groupId) return { ok: false, message: '合并失败' };
  editor.renameNode(groupId, below?.name?.trim() || '合并图层');
  editor.select([groupId]);
  sync(editor);
  return { ok: true };
}

/** Group all visible top-level layers into one. */
export function mergeVisible(editor: Editor): LayerOpResult {
  const tree = editor.getLayerTree().filter((e) => (e.depth ?? 0) === 0);
  const visibleIds = tree
    .filter((e) => e.node.visible !== false)
    .map((e) => e.node.id)
    .filter(Boolean);
  if (visibleIds.length < 2) return { ok: false, message: '至少需要两个可见图层' };
  editor.select(visibleIds);
  const groupId = editor.groupSelected();
  if (!groupId) return { ok: false, message: '合并可见失败' };
  editor.renameNode(groupId, '合并可见');
  editor.select([groupId]);
  sync(editor);
  return { ok: true };
}

/** Flatten all visible top-level layers into a single vector. */
export function flattenVisible(editor: Editor): LayerOpResult {
  const tree = editor.getLayerTree().filter((e) => (e.depth ?? 0) === 0);
  const visibleIds = tree
    .filter((e) => e.node.visible !== false)
    .map((e) => e.node.id)
    .filter(Boolean);
  if (visibleIds.length < 1) return { ok: false, message: '没有可见图层' };
  editor.select(visibleIds);
  const id = editor.flattenSelected();
  if (!id) return { ok: false, message: '拼合失败（部分节点无法拼合）' };
  editor.renameNode(id, '拼合图层');
  editor.select([id]);
  sync(editor);
  return { ok: true };
}
