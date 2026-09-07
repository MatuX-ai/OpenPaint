/**
 * Activate left-rail tools and keep Pinia ↔ OpenPencil in sync.
 */

import { useCanvasStore } from '@stores/canvasStore';
import { getOpenPencilBridge } from '@composables/useOpenPencil';
import {
  fromOpenPencilTool,
  getToolDef,
  isRasterTool,
  isVectorStyleTool,
  toOpenPencilTool,
  type ToolType,
} from '@/tools/editorTools';
import type { Tool as OpenPencilTool } from '@open-pencil/core/editor';
import { noteVectorCreateTool } from '@composables/vectorStrokeStyle';

export interface ActivateToolResult {
  ok: boolean;
  reason?: 'comingSoon' | 'unknown' | 'bridgeError';
  message?: string;
}

export function activateTool(tool: ToolType): ActivateToolResult {
  const def = getToolDef(tool);
  if (!def) return { ok: false, reason: 'unknown', message: `未知工具：${tool}` };

  if (def.availability === 'comingSoon') {
    const kind = def.id === 'brush' || isRasterTool(def.id) ? '像素' : '';
    return {
      ok: false,
      reason: 'comingSoon',
      message: kind ? `${def.label}：${kind}工具即将推出` : `${def.label}：即将推出`,
    };
  }

  const store = useCanvasStore();
  store.setActiveTool(tool);
  if (isVectorStyleTool(tool)) {
    noteVectorCreateTool(tool);
  }

  try {
    const bridge = getOpenPencilBridge();
    if (isRasterTool(tool)) {
      // Keep OpenPencil on SELECT; capture-phase handlers in useRasterPixelTools
      // own pointer input so nodes are not moved while erasing / filling.
      bridge.editor.setTool('SELECT');
      return { ok: true };
    }

    const op = toOpenPencilTool(tool);
    if (op) bridge.editor.setTool(op);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: 'bridgeError',
      message: `切换工具失败：${String((e as Error).message ?? e)}`,
    };
  }
}

/** Sync Pinia when OpenPencil itself changes the active tool. */
export function syncToolFromOpenPencil(opTool: OpenPencilTool): void {
  const store = useCanvasStore();
  // Raster tools keep OP on SELECT. Ignore SELECT echoes so Pinia stays on
  // eraser/bucket; if the user picks another tool via ToolbarRoot, leave raster.
  if (isRasterTool(store.activeTool) && opTool === 'SELECT') return;
  const next = fromOpenPencilTool(opTool);
  if (store.activeTool !== next) {
    store.setActiveTool(next);
  }
}
