/**
 * Canvas UI state.
 *
 * Mirrors the backend's canvas (`Arc<RwLock<CanvasState>>`) so any
 * component can react to layer / selection changes without needing
 * to call Tauri commands directly.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Layer, Selection, ToolType } from '@/types/canvas';

export const useCanvasStore = defineStore('canvas', () => {
  // --- View / tool state ---
  const activeTool = ref<ToolType>('select');
  const zoom = ref(1.0);
  const panX = ref(0);
  const panY = ref(0);

  // --- Brush parameters (for brush / eraser) ---
  const brushColor = ref('#6c5ce7');
  const brushRadius = ref(8);
  // Active brush preset id (W10). Defaults match Rust `canvas::brush::DEFAULT_BRUSH_ID`.
  const activeBrushId = ref('round-hard');

  // --- Layer state (synced from backend via useCanvas.refresh) ---
  const layerList = ref<Layer[]>([]);
  const activeLayerId = ref<string | null>(null);
  const canvasWidth = ref(1920);
  const canvasHeight = ref(1080);

  // --- Selection state ---
  const selection = ref<Selection | null>(null);

  // --- History state ---
  const canUndo = ref(false);
  const canRedo = ref(false);

  // --- Computed ---
  const activeLayer = computed(
    () => layerList.value.find((l) => l.id === activeLayerId.value) ?? null,
  );

  // --- Actions ---
  function setActiveTool(tool: ToolType) {
    activeTool.value = tool;
  }

  function setZoom(z: number) {
    zoom.value = Math.max(0.1, Math.min(10.0, z));
  }

  function resetView() {
    zoom.value = 1.0;
    panX.value = 0;
    panY.value = 0;
  }

  function setBrushColor(color: string) {
    brushColor.value = color;
  }
  function setBrushRadius(r: number) {
    brushRadius.value = Math.max(1, Math.min(200, r));
  }
  /** W10 — switch the active brush preset (must reference an existing id). */
  function setActiveBrush(id: string) {
    activeBrushId.value = id;
  }

  return {
    // state
    activeTool,
    zoom,
    panX,
    panY,
    brushColor,
    brushRadius,
    activeBrushId,
    layerList,
    activeLayerId,
    canvasWidth,
    canvasHeight,
    selection,
    canUndo,
    canRedo,
    // getters
    activeLayer,
    // actions
    setActiveTool,
    setZoom,
    resetView,
    setBrushColor,
    setBrushRadius,
    setActiveBrush,
  };
});
