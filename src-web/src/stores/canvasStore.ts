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

  // --- Pixel-tool params (eraser / bucket; future brush) ---
  const brushColor = ref('#6c5ce7');
  const brushRadius = ref(8);
  /** Paint-bucket color tolerance (0–255, Paint.NET–style). */
  const bucketTolerance = ref(32);
  // Active brush preset id (W10). Defaults match Rust `canvas::brush::DEFAULT_BRUSH_ID`.
  const activeBrushId = ref('round-hard');

  // --- Vector style prefs (pen / shapes / text / selection) ---
  const fillColor = ref('#d4d4d4');
  const fillEnabled = ref(true);
  const strokeColor = ref('#000000');
  const strokeWeight = ref(2);
  const strokeEnabled = ref(true);
  const fontSize = ref(16);
  const polygonSides = ref(3);
  const starPoints = ref(5);
  const starInnerRadius = ref(0.38);

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
  function setBucketTolerance(t: number) {
    bucketTolerance.value = Math.max(0, Math.min(255, Math.round(t)));
  }
  function setFillColor(color: string) {
    fillColor.value = color;
  }
  function setFillEnabled(on: boolean) {
    fillEnabled.value = on;
  }
  function setStrokeColor(color: string) {
    strokeColor.value = color;
  }
  function setStrokeWeight(w: number) {
    strokeWeight.value = Math.max(0.5, Math.min(64, w));
  }
  function setStrokeEnabled(on: boolean) {
    strokeEnabled.value = on;
  }
  function setFontSize(size: number) {
    fontSize.value = Math.max(8, Math.min(256, Math.round(size)));
  }
  function setPolygonSides(n: number) {
    polygonSides.value = Math.max(3, Math.min(24, Math.round(n)));
  }
  function setStarPoints(n: number) {
    starPoints.value = Math.max(3, Math.min(24, Math.round(n)));
  }
  function setStarInnerRadius(r: number) {
    starInnerRadius.value = Math.max(0.05, Math.min(0.95, r));
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
    bucketTolerance,
    activeBrushId,
    fillColor,
    fillEnabled,
    strokeColor,
    strokeWeight,
    strokeEnabled,
    fontSize,
    polygonSides,
    starPoints,
    starInnerRadius,
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
    setBucketTolerance,
    setFillColor,
    setFillEnabled,
    setStrokeColor,
    setStrokeWeight,
    setStrokeEnabled,
    setFontSize,
    setPolygonSides,
    setStarPoints,
    setStarInnerRadius,
    setActiveBrush,
  };
});
