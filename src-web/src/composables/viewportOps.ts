/**
 * Viewport helpers — drive OpenPencil zoom/pan; Pinia mirrors via sync.
 */

import type { Editor } from '@open-pencil/core/editor';
import { syncOpenPencilStateToCanvasStore } from '@composables/useOpenPencil';

function sync(editor: Editor): void {
  syncOpenPencilStateToCanvasStore(editor);
}

export function zoomIn(editor: Editor, factor = 1.2): void {
  const z = editor.state.zoom || 1;
  editor.zoomToLevel(Math.min(64, z * factor));
  sync(editor);
}

export function zoomOut(editor: Editor, factor = 1.2): void {
  const z = editor.state.zoom || 1;
  editor.zoomToLevel(Math.max(0.02, z / factor));
  sync(editor);
}

export function zoomTo100(editor: Editor): void {
  editor.zoomTo100();
  sync(editor);
}

export function zoomToFit(editor: Editor): void {
  editor.zoomToFit();
  sync(editor);
}

export function syncHistoryFlags(editor: Editor): void {
  syncOpenPencilStateToCanvasStore(editor);
}
