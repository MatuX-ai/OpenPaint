<!--
  Canvas toolbar (above the canvas, below the top bar).
  Brush size + colour controls for the active drawing tool.
-->

<script setup lang="ts">
import { computed } from 'vue';
import { useCanvasStore } from '@stores/canvasStore';

const store = useCanvasStore();

const showBrushControls = computed(
  () => store.activeTool === 'brush' || store.activeTool === 'eraser'
);

const swatches = ['#6c5ce7', '#000000', '#ffffff', '#fdcb6e', '#e17055', '#00b894', '#0984e3', '#d63031'];

function pickColor(color: string) {
  store.setBrushColor(color);
}
function setRadius(e: Event) {
  const target = e.target as HTMLInputElement;
  store.setBrushRadius(parseInt(target.value, 10));
}
</script>

<template>
  <div class="canvas-toolbar">
    <div class="canvas-toolbar__group">
      <span class="canvas-toolbar__label">工具：{{ store.activeTool }}</span>
    </div>

    <div v-if="showBrushControls" class="canvas-toolbar__group canvas-toolbar__group--brush">
      <span class="canvas-toolbar__label">颜色</span>
      <div class="canvas-toolbar__swatches">
        <button
          v-for="color in swatches"
          :key="color"
          type="button"
          class="canvas-toolbar__swatch"
          :class="{ 'is-active': store.brushColor === color }"
          :style="{ backgroundColor: color }"
          :title="color"
          @click="pickColor(color)"
        />
      </div>
      <label class="canvas-toolbar__radius">
        <span>粗细 {{ store.brushRadius }}</span>
        <input
          type="range"
          min="1"
          max="64"
          step="1"
          :value="store.brushRadius"
          @input="setRadius"
        />
      </label>
    </div>
  </div>
</template>

<style scoped lang="scss">
.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: var(--font-size-sm);

  &__group {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }

  &__label {
    color: var(--text-muted);
    text-transform: uppercase;
    font-size: var(--font-size-xs);
    letter-spacing: 0.4px;
  }

  &__swatches {
    display: inline-flex;
    gap: 4px;
  }

  &__swatch {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--bg-secondary);
    outline: 1px solid var(--border-color);
    transition: transform var(--transition-fast);

    &:hover { transform: scale(1.1); }
    &.is-active { outline: 2px solid var(--accent); }
  }

  &__radius {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-secondary);
    font-size: var(--font-size-xs);

    input[type="range"] {
        width: 96px;
        accent-color: var(--accent);
      }
  }
}
</style>