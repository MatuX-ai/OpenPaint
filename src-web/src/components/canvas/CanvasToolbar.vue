<!--
  Canvas toolbar (above the canvas, below the top bar).

  UX-A09 / §2.2: 主工具条信息密度低 → 现包含 5 组（用 `│` 视觉分隔）：
    [↶ 撤销] [↷ 重做] │ [+ 新建图层] │ [−][100%][+][适配] │ 工具：画笔 │ ●●●●●●●● │ 粗细 ▭▭▭ 32

  设计原则：
  - 撤销/重做/新建图层/缩放/适配 是"全局工具"，任何 activeTool 下都显示。
  - 颜色/粗细 仍是画笔/橡皮专属条件渲染（其余工具隐藏避免空 UI）。
-->

<script setup lang="ts">
import { computed } from 'vue';
import {
  Undo2,
  Redo2,
  Plus,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-vue-next';
import { useCanvasStore } from '@stores/canvasStore';
import { useToast } from '@composables/useToast';
import { useCanvas } from '@composables/useCanvas';
import { canvasApi } from '@api/index';

const store = useCanvasStore();
const toast = useToast();
const canvas = useCanvas();

const showBrushControls = computed(
  () => store.activeTool === 'brush' || store.activeTool === 'eraser',
);

const toolLabel = computed<string>(() => {
  switch (store.activeTool) {
    case 'select':
      return '选择';
    case 'rect-select':
      return '矩形选区';
    case 'brush':
      return '画笔';
    case 'eraser':
      return '橡皮';
    case 'move':
      return '移动';
    case 'transform':
      return '变形';
    default:
      return store.activeTool;
  }
});

const zoomPercent = computed(() => Math.round(store.zoom * 100));

const swatches = [
  '#6c5ce7',
  '#000000',
  '#ffffff',
  '#fdcb6e',
  '#e17055',
  '#00b894',
  '#0984e3',
  '#d63031',
];

function pickColor(color: string) {
  store.setBrushColor(color);
}
function setRadius(e: Event) {
  const target = e.target as HTMLInputElement;
  store.setBrushRadius(parseInt(target.value, 10));
}

async function doUndo() {
  try {
    await canvasApi.undo();
    await canvas.refresh();
  } catch (e) {
    toast.error(`撤销失败：${String((e as Error).message ?? e)}`);
  }
}
async function doRedo() {
  try {
    await canvasApi.redo();
    await canvas.refresh();
  } catch (e) {
    toast.error(`重做失败：${String((e as Error).message ?? e)}`);
  }
}
async function doAddLayer() {
  try {
    const id = await canvasApi.addLayer(`图层 ${store.layerList.length + 1}`);
    store.activeLayerId = id;
    await canvas.refresh();
    toast.success('已新建图层');
  } catch (e) {
    toast.error(`新建图层失败：${String((e as Error).message ?? e)}`);
  }
}
function zoomIn() {
  store.setZoom(store.zoom * 1.2);
}
function zoomOut() {
  store.setZoom(store.zoom / 1.2);
}
</script>

<template>
  <div class="canvas-toolbar" role="toolbar" aria-label="画布主工具条">
    <!-- 撤销 / 重做 -->
    <div class="canvas-toolbar__group">
      <button
        type="button"
        class="canvas-toolbar__btn"
        :disabled="!store.canUndo"
        title="撤销 (Ctrl+Z)"
        aria-label="撤销"
        @click="doUndo"
      >
        <Undo2 :size="14" />
      </button>
      <button
        type="button"
        class="canvas-toolbar__btn"
        :disabled="!store.canRedo"
        title="重做 (Ctrl+Y)"
        aria-label="重做"
        @click="doRedo"
      >
        <Redo2 :size="14" />
      </button>
    </div>

    <span class="canvas-toolbar__sep" aria-hidden="true" />

    <!-- 新建图层 -->
    <div class="canvas-toolbar__group">
      <button
        type="button"
        class="canvas-toolbar__btn canvas-toolbar__btn--labeled"
        title="新建图层"
        aria-label="新建图层"
        @click="doAddLayer"
      >
        <Plus :size="14" />
        <span>图层</span>
      </button>
    </div>

    <span class="canvas-toolbar__sep" aria-hidden="true" />

    <!-- 缩放 -->
    <div class="canvas-toolbar__group canvas-toolbar__group--zoom">
      <button
        type="button"
        class="canvas-toolbar__btn canvas-toolbar__btn--icon"
        title="缩小 (−)"
        aria-label="缩小"
        @click="zoomOut"
      >
        <ZoomOut :size="14" />
      </button>
      <span class="canvas-toolbar__zoom-label" aria-live="polite">{{ zoomPercent }}%</span>
      <button
        type="button"
        class="canvas-toolbar__btn canvas-toolbar__btn--icon"
        title="放大 (+ / =)"
        aria-label="放大"
        @click="zoomIn"
      >
        <ZoomIn :size="14" />
      </button>
      <button
        type="button"
        class="canvas-toolbar__btn canvas-toolbar__btn--icon"
        title="适配窗口 (Ctrl+Shift+0)"
        aria-label="适配窗口"
        @click="store.resetView()"
      >
        <Maximize2 :size="14" />
      </button>
    </div>

    <span class="canvas-toolbar__sep" aria-hidden="true" />

    <!-- 工具名 -->
    <div class="canvas-toolbar__group">
      <span class="canvas-toolbar__tool-label">
        工具：<strong>{{ toolLabel }}</strong>
      </span>
    </div>

    <!-- 画笔参数：仅画笔/橡皮可见 -->
    <template v-if="showBrushControls">
      <span class="canvas-toolbar__sep" aria-hidden="true" />

      <div class="canvas-toolbar__group">
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
            :aria-label="`选择颜色 ${color}`"
            @click="pickColor(color)"
          />
        </div>
      </div>

      <div class="canvas-toolbar__group">
        <label class="canvas-toolbar__radius">
          <span class="canvas-toolbar__label">粗细</span>
          <input
            type="range"
            min="1"
            max="64"
            step="1"
            :value="store.brushRadius"
            :aria-label="`画笔粗细 ${store.brushRadius} 像素`"
            @input="setRadius"
          />
          <span class="canvas-toolbar__radius-value">{{ store.brushRadius }}</span>
        </label>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.canvas-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: var(--font-size-sm);
  min-height: 36px;

  &__group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  &__sep {
    width: 1px;
    height: 18px;
    margin: 0 var(--space-1);
    background: var(--border-color);
    flex-shrink: 0;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 26px;
    min-width: 28px;
    padding: 0 8px;
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      border-color var(--transition-fast);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    &--icon {
      padding: 0;
      width: 28px;
    }

    &--labeled {
      padding: 0 10px;
    }
  }

  &__zoom-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    height: 26px;
    padding: 0 4px;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
  }

  &__tool-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-xs);
    color: var(--text-muted);

    strong {
      font-weight: 600;
      color: var(--text-primary);
    }
  }

  &__label {
    color: var(--text-muted);
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.4px;
  }

  &__swatches {
    display: inline-flex;
    gap: 4px;
  }

  &__swatch {
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    border: 2px solid var(--bg-secondary);
    outline: 1px solid var(--border-color);
    cursor: pointer;
    transition: transform var(--transition-fast);

    &:hover {
      transform: scale(1.1);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    &.is-active {
      outline: 2px solid var(--accent);
      outline-offset: 0;
    }
  }

  &__radius {
    display: inline-flex;
    align-items: center;
    gap: 6px;

    input[type='range'] {
      width: 96px;
      accent-color: var(--accent);
    }
  }

  &__radius-value {
    min-width: 22px;
    text-align: right;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }
}
</style>
