<!--
  Central canvas view.

  Renders the canvas PNG returned by the backend and forwards pointer
  events to the active tool via `useCanvas`. All state lives in
  `canvasStore` and is mutated through `useCanvas` actions.
-->

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useCanvas } from '@composables/useCanvas';
import { useCanvasStore } from '@stores/canvasStore';
import SelectionRect from './SelectionRect.vue';

const canvasStore = useCanvasStore();
const {
  canvasRef,
  isDrawing,
  activeTool,
  viewport,
  pointer,
  paintBase64,
  refresh,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  zoomIn,
  zoomOut,
  resetView,
} = useCanvas();

const cursorClass = computed(() => `canvas-view__canvas-area--tool-${activeTool.value}`);

onMounted(async () => {
  // First paint: ask the backend for a fresh render and layer list.
  try {
    await refresh();
  } catch (e) {
    console.warn('[CanvasView] initial refresh failed:', e);
  }
});

// React to brush colour / radius changes via the store; nothing to do
// beyond ensuring the composable reads from the store (already does).

// Re-render when the user resizes the window so the canvas DOM size
// tracks the host element.
watch(viewport, () => {
  /* no-op — viewport changes only affect transforms, not raster size. */
});

defineExpose({ canvasRef, paintBase64, refresh, zoomIn, zoomOut, resetView });
</script>

<template>
  <main class="canvas-view" :class="cursorClass">
    <div
      class="canvas-view__canvas-area"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <!-- transformable wrapper handles zoom/pan -->
      <div
        class="canvas-view__viewport"
        :style="{ transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})` }"
      >
        <div class="canvas-view__checker">
          <canvas ref="canvasRef" class="canvas-view__canvas" />
          <SelectionRect v-if="canvasStore.selection" :selection="canvasStore.selection" />
        </div>
      </div>

      <!-- bottom-right zoom HUD -->
      <div class="canvas-view__zoom-hud">
        <button class="canvas-view__zoom-btn" type="button" @click="zoomOut">−</button>
        <span class="canvas-view__zoom-value">{{ Math.round(viewport.zoom * 100) }}%</span>
        <button class="canvas-view__zoom-btn" type="button" @click="zoomIn">+</button>
        <button class="canvas-view__zoom-btn" type="button" @click="resetView" title="重置视图">⌂</button>
      </div>

      <!-- pointer crosshair when active tool is something drawing -->
      <div
        v-if="pointer && (activeTool === 'brush' || activeTool === 'eraser' || activeTool === 'rect-select')"
        class="canvas-view__crosshair"
        :style="{ left: pointer.x + 'px', top: pointer.y + 'px' }"
      />
      <div v-if="isDrawing" class="canvas-view__drawing-flag" />
    </div>
  </main>
</template>

<style scoped lang="scss">
.canvas-view {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);

  &__canvas-area {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--bg-primary);

    &--tool-select { cursor: default; }
    &--tool-brush { cursor: crosshair; }
    &--tool-eraser { cursor: crosshair; }
    &--tool-rect-select { cursor: crosshair; }
    &--tool-move { cursor: move; }
    &--tool-transform { cursor: nesw-resize; }
  }

  &__viewport {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
  }

  &__checker {
    position: relative;
    width: 100%;
    height: 100%;
    background-image:
      linear-gradient(45deg, var(--bg-tertiary) 25%, transparent 25%),
      linear-gradient(-45deg, var(--bg-tertiary) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--bg-tertiary) 75%),
      linear-gradient(-45deg, transparent 75%, var(--bg-tertiary) 75%);
    background-size: 16px 16px;
    background-position: 0 0, 0 8px, 8px -8px, -8px 0;
    opacity: 0.4;
  }

  &__canvas {
    display: block;
    image-rendering: pixelated;
    background: transparent;
  }

  &__zoom-hud {
    position: absolute;
    right: var(--space-3);
    bottom: var(--space-3);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    z-index: 5;
  }

  &__zoom-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &__zoom-value {
    min-width: 48px;
    text-align: center;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }

  &__crosshair {
    position: absolute;
    width: 1px;
    height: 1px;
    pointer-events: none;
    z-index: 6;

    &::before,
    &::after {
      content: '';
      position: absolute;
      background: var(--accent);
      opacity: 0.7;
    }
    &::before { width: 12px; height: 1px; left: -6px; top: 0; }
    &::after  { width: 1px; height: 12px; left: 0; top: -6px; }
  }

  &__drawing-flag {
    position: absolute;
    top: var(--space-2);
    left: var(--space-3);
    padding: 2px 8px;
    font-size: var(--font-size-xs);
    color: var(--accent);
    background: var(--accent-light);
    border-radius: var(--radius-sm);
  }
}
</style>