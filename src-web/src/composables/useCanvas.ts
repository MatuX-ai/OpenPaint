/**
 * useCanvas — central canvas interaction composable.
 *
 * Responsibilities:
 *   - Viewport <-> canvas coordinate transforms (zoom/pan)
 *   - Render the latest canvas PNG onto the host element
 *   - Capture pointer events for the active tool (brush / eraser / rect-select)
 *   - Forward strokes to the backend via `canvasApi`
 */

import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { useCanvasStore } from '@stores/canvasStore';
import { canvasApi } from '@api/index';
import { debounce } from '@utils/helpers';
import type { Layer, Selection, ToolType } from '@/types/canvas';

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
}

/** Internal drag state. */
interface DragState {
  active: boolean;
  tool: ToolType | null;
  /** Anchor in canvas coordinates for rect-select drag. */
  anchor: [number, number] | null;
}

export interface UseCanvasReturn {
  store: ReturnType<typeof useCanvasStore>;
  canvasRef: Ref<HTMLCanvasElement | null>;
  isDrawing: Readonly<Ref<boolean>>;
  activeTool: Readonly<Ref<ToolType>>;
  viewport: Readonly<Ref<ViewportTransform>>;
  pointer: Readonly<Ref<{ x: number; y: number } | null>>;
  paintBase64: (pngBase64: string) => Promise<void>;
  refresh: () => Promise<void>;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  clearSelection: () => Promise<void>;
}

export function useCanvas(): UseCanvasReturn {
  const store = useCanvasStore();
  const canvasRef = ref<HTMLCanvasElement | null>(null);

  const isDrawing = ref(false);
  const pointer = ref<{ x: number; y: number } | null>(null);

  // Brush/eraser stroke buffer (canvas-coordinate integer points).
  const strokeBuffer: Array<[number, number]> = [];
  // Rect-select drag state.
  const drag: DragState = { active: false, tool: null, anchor: null };

  const viewport = computed<ViewportTransform>(() => ({
    zoom: store.zoom,
    panX: store.panX,
    panY: store.panY,
  }));

  const activeTool = computed<ToolType>({
    get: () => store.activeTool,
    set: (tool) => store.setActiveTool(tool),
  });

  // -------------------- Coordinate helpers --------------------

  function viewportToCanvas(x: number, y: number): { x: number; y: number } {
    return {
      x: (x - viewport.value.panX) / viewport.value.zoom,
      y: (y - viewport.value.panY) / viewport.value.zoom,
    };
  }

  // -------------------- Rendering --------------------

  function paintBase64(pngBase64: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.value;
      if (!canvas) {
        resolve();
        return;
      }
      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Cannot acquire 2D context'));
          return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve();
      };
      img.onerror = () => reject(new Error('Failed to load PNG'));
      const src = pngBase64.startsWith('data:image/')
        ? pngBase64
        : `data:image/png;base64,${pngBase64}`;
      img.src = src;
    });
  }

  /** Pull state from backend into the store. */
  async function syncFromBackend() {
    try {
      const summary = await canvasApi.getCanvasSummary();
      const layers: Layer[] = summary.layers.map((wire) => ({
        id: wire.id,
        name: wire.name,
        opacity: wire.opacity,
        blendMode: (wire.blend_mode as Layer['blendMode']) ?? 'normal',
        visible: wire.visible,
        locked: wire.locked,
        width: wire.width,
        height: wire.height,
        offsetX: wire.offset_x,
        offsetY: wire.offset_y,
        isActive: wire.is_active,
      }));
      store.layerList = layers;
      store.activeLayerId = summary.activeLayerId;
      store.canvasWidth = summary.width;
      store.canvasHeight = summary.height;
      store.canUndo = summary.canUndo;
      store.canRedo = summary.canRedo;
    } catch (e) {
      console.error('[useCanvas] syncFromBackend failed:', e);
    }
  }

  /** Full render + state sync. */
  async function refresh() {
    try {
      const png = await canvasApi.renderCanvasPng();
      await paintBase64(png);
      await syncFromBackend();
    } catch (e) {
      console.error('[useCanvas] refresh failed:', e);
    }
  }

  // -------------------- Pointer event handlers --------------------

  function onPointerDown(event: PointerEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    pointer.value = { x: localX, y: localY };
    const tool = activeTool.value;

    if (tool === 'brush' || tool === 'eraser') {
      if (!store.activeLayerId) {
        console.warn('[useCanvas] brush/eraser ignored: no active layer');
        return;
      }
      isDrawing.value = true;
      drag.active = true;
      drag.tool = tool;
      drag.anchor = null;
      strokeBuffer.length = 0;
      const c = viewportToCanvas(localX, localY);
      strokeBuffer.push([Math.round(c.x), Math.round(c.y)]);
      capture(event);
    } else if (tool === 'rect-select') {
      isDrawing.value = true;
      drag.active = true;
      drag.tool = tool;
      const c = viewportToCanvas(localX, localY);
      drag.anchor = [Math.round(c.x), Math.round(c.y)];
      capture(event);
    }
  }

  function onPointerMove(event: PointerEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointer.value = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (!drag.active) return;

    const c = viewportToCanvas(pointer.value.x, pointer.value.y);
    const x = Math.round(c.x);
    const y = Math.round(c.y);

    if (drag.tool === 'brush' || drag.tool === 'eraser') {
      strokeBuffer.push([x, y]);
    }
    // For rect-select we just wait for the up event to compute bounds.
  }

  async function onPointerUp(event: PointerEvent) {
    release(event);
    if (!drag.active) return;
    const tool = drag.tool;
    const layerId = store.activeLayerId;
    drag.active = false;
    drag.tool = null;
    isDrawing.value = false;

    if ((tool === 'brush' || tool === 'eraser') && layerId && strokeBuffer.length > 0) {
      const args = {
        layer_id: layerId,
        points: strokeBuffer.slice(),
        radius: store.brushRadius,
        color: store.brushColor,
      };
      strokeBuffer.length = 0;
      const op = tool === 'brush' ? canvasApi.applyBrushStroke : canvasApi.applyEraserStroke;
      try {
        await op(args);
        await refresh();
      } catch (e) {
        console.error(`[useCanvas] ${tool} failed:`, e);
      }
      return;
    }

    if (tool === 'rect-select' && drag.anchor && pointer.value) {
      const c = viewportToCanvas(pointer.value.x, pointer.value.y);
      const x0 = Math.min(drag.anchor[0], Math.round(c.x));
      const y0 = Math.min(drag.anchor[1], Math.round(c.y));
      const w = Math.abs(Math.round(c.x) - drag.anchor[0]);
      const h = Math.abs(Math.round(c.y) - drag.anchor[1]);
      drag.anchor = null;
      if (w < 2 || h < 2) return;
      try {
        await canvasApi.setRectSelection({ x: x0, y: y0, width: w, height: h });
        store.selection = { x: x0, y: y0, width: w, height: h } as Selection;
        await refresh();
      } catch (e) {
        console.error('[useCanvas] setRectSelection failed:', e);
      }
    }
  }

  function capture(event: PointerEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
    event.preventDefault();
  }

  function release(event: PointerEvent) {
    const canvas = canvasRef.value;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {
      // ignore
    }
  }

  // -------------------- View transforms --------------------

  function zoomIn() {
    store.setZoom(store.zoom * 1.2);
  }
  function zoomOut() {
    store.setZoom(store.zoom / 1.2);
  }
  function resetView() {
    store.resetView();
  }

  async function clearSelection() {
    try {
      await canvasApi.clearSelection();
      store.selection = null;
    } catch (e) {
      console.error('[useCanvas] clearSelection failed:', e);
    }
  }

  // -------------------- Lifecycle --------------------

  // Re-sync when active layer changes.
  const onLayerChanged = debounce(() => {
    void refresh();
  }, 30);
  watch(
    () => store.activeLayerId,
    () => onLayerChanged(),
  );

  onBeforeUnmount(() => {
    strokeBuffer.length = 0;
    drag.anchor = null;
  });

  return {
    store,
    canvasRef,
    isDrawing: isDrawing as Readonly<Ref<boolean>>,
    activeTool: activeTool as Readonly<Ref<ToolType>>,
    viewport: viewport as Readonly<Ref<ViewportTransform>>,
    pointer: pointer as Readonly<Ref<{ x: number; y: number } | null>>,
    paintBase64,
    refresh,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    zoomIn,
    zoomOut,
    resetView,
    clearSelection,
  };
}
