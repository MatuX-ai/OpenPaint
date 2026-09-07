<!--
  Canvas toolbar (above the canvas, below the top bar).

  UX-A09 / §2.2: 主工具条信息密度低 → 现包含多组（用 `│` 视觉分隔）：
    [↶ 撤销] [↷ 重做] │ [+ 新建图层] │ [↻ 旋转] [T 文字] │ [−][100%][+][适配] │ 工具：xxx │ 颜色 ●●●●●●●● │ 粗细 ▭▭▭ 32 │ [混合 normal ▾]

  W13 UX 验收补齐：
    - 暴露 canvasApi.rotateLayer（旋转活动图层 +90° / -90° / 任意角度）
    - 暴露 canvasApi.addText（打开文字输入对话框）
    - 暴露 canvasApi.setLayerBlendMode（混合模式下拉）
    - 窄屏（< 1024px）下 flex-wrap: wrap，避免溢出遮挡右栏
-->

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Undo2,
  Redo2,
  Plus,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Type as TypeIcon,
  ChevronDown,
} from 'lucide-vue-next';
import { useCanvasStore } from '@stores/canvasStore';
import { useToast } from '@composables/useToast';
import { canvasApi } from '@api/index';
import { getOpenPencilBridge } from '@composables/useOpenPencil';
import type { BlendMode } from '@/types/canvas';
import { isShapeDrawTool, toolLabel as resolveToolLabel } from '@/tools/editorTools';
import { activateTool } from '@/tools/useEditorTool';
import {
  applyFillStyleToSelected,
  applyShapeExtrasToSelected,
  applyStrokeStyleToSelected,
  applyTextStyleToSelected,
} from '@composables/vectorStrokeStyle';
import { isPageNode } from '@utils/nodeType';
import {
  addLayer as addOpLayer,
  rotateLayer as rotateOpLayer,
  setLayerBlendMode,
} from '@composables/layerOps';
import {
  zoomIn as zoomInOp,
  zoomOut as zoomOutOp,
  zoomToFit as zoomToFitOp,
} from '@composables/viewportOps';
import TextInputDialog from './TextInputDialog.vue';

const store = useCanvasStore();
const toast = useToast();
const bridge = getOpenPencilBridge();

function selectedNodes() {
  void store.activeLayerId;
  void store.layerList;
  try {
    return bridge.editor.getSelectedNodes();
  } catch {
    return [];
  }
}

const showRasterControls = computed(
  () => store.activeTool === 'eraser' || store.activeTool === 'bucket',
);
const showEraserSize = computed(() => store.activeTool === 'eraser');
const showBucketControls = computed(() => store.activeTool === 'bucket');

const showFillControls = computed(() => {
  if (store.activeTool === 'text') return true;
  if (isShapeDrawTool(store.activeTool) && store.activeTool !== 'line') return true;
  return selectedNodes().some((n) => {
    if (n.type === 'TEXT' || isPageNode(n) || n.type === 'VECTOR') return n.type === 'TEXT';
    return ['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'FRAME'].includes(n.type);
  });
});

const showStrokeControls = computed(() => {
  if (store.activeTool === 'pen' || store.activeTool === 'line') return true;
  if (isShapeDrawTool(store.activeTool)) return true;
  return selectedNodes().some((n) => {
    const strokes = (n as { strokes?: unknown[] }).strokes;
    return (
      n.type === 'VECTOR' ||
      n.type === 'LINE' ||
      ['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'FRAME'].includes(n.type) ||
      Boolean(strokes?.length)
    );
  });
});

const showTextControls = computed(() => {
  if (store.activeTool === 'text') return true;
  return selectedNodes().some((n) => n.type === 'TEXT');
});

const showPolygonControls = computed(
  () => store.activeTool === 'polygon' || selectedNodes().some((n) => n.type === 'POLYGON'),
);
const showStarControls = computed(
  () => store.activeTool === 'star' || selectedNodes().some((n) => n.type === 'STAR'),
);

const textDialogOpen = ref(false);

const toolLabel = computed<string>(() => resolveToolLabel(store.activeTool));

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
  '#d4d4d4',
];

const blendModes: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: '正常' },
  { value: 'multiply', label: '正片叠底' },
  { value: 'screen', label: '滤色' },
  { value: 'overlay', label: '叠加' },
];

function canApplyToSelection(): boolean {
  // Pen stroke applies on commit; mid-draw only updates store prefs.
  try {
    if (store.activeTool === 'pen' && bridge.editor.state.penState) return false;
  } catch {
    /* ignore */
  }
  return true;
}

function pickColor(color: string) {
  store.setBrushColor(color);
}
function setRadius(e: Event) {
  const target = e.target as HTMLInputElement;
  store.setBrushRadius(parseInt(target.value, 10));
}
function setTolerance(e: Event) {
  const target = e.target as HTMLInputElement;
  store.setBucketTolerance(parseInt(target.value, 10));
}
function pickFillColor(color: string) {
  store.setFillColor(color);
  store.setFillEnabled(true);
  if (!canApplyToSelection()) return;
  if (store.activeTool === 'text' || selectedNodes().some((n) => n.type === 'TEXT')) {
    applyTextStyleToSelected(bridge.editor);
  } else {
    applyFillStyleToSelected(bridge.editor);
  }
}
function toggleFillEnabled() {
  store.setFillEnabled(!store.fillEnabled);
  if (canApplyToSelection()) applyFillStyleToSelected(bridge.editor);
}
function pickStrokeColor(color: string) {
  store.setStrokeColor(color);
  store.setStrokeEnabled(true);
  if (canApplyToSelection()) applyStrokeStyleToSelected(bridge.editor);
}
function setStrokeWeight(e: Event) {
  const target = e.target as HTMLInputElement;
  store.setStrokeWeight(parseFloat(target.value));
  if (canApplyToSelection()) applyStrokeStyleToSelected(bridge.editor);
}
function toggleStrokeEnabled() {
  store.setStrokeEnabled(!store.strokeEnabled);
  if (canApplyToSelection()) applyStrokeStyleToSelected(bridge.editor);
}
function setFontSize(e: Event) {
  const target = e.target as HTMLInputElement;
  store.setFontSize(parseInt(target.value, 10));
  if (canApplyToSelection()) applyTextStyleToSelected(bridge.editor);
}
function setPolygonSides(e: Event) {
  const target = e.target as HTMLInputElement;
  store.setPolygonSides(parseInt(target.value, 10));
  if (canApplyToSelection()) applyShapeExtrasToSelected(bridge.editor);
}
function setStarPoints(e: Event) {
  const target = e.target as HTMLInputElement;
  store.setStarPoints(parseInt(target.value, 10));
  if (canApplyToSelection()) applyShapeExtrasToSelected(bridge.editor);
}
function setStarInner(e: Event) {
  const target = e.target as HTMLInputElement;
  store.setStarInnerRadius(parseFloat(target.value));
  if (canApplyToSelection()) applyShapeExtrasToSelected(bridge.editor);
}
// W14+ 统一画布架构：撤销 / 重做直接走 OpenPencil editor（共享 SceneGraph 历史），
// 不再调用 Rust canvasApi.undo / redo。
async function doUndo() {
  try {
    bridge.undo();
  } catch (e) {
    toast.error(`撤销失败：${String((e as Error).message ?? e)}`);
  }
}
async function doRedo() {
  try {
    bridge.redo();
  } catch (e) {
    toast.error(`重做失败：${String((e as Error).message ?? e)}`);
  }
}
async function doAddLayer() {
  try {
    const r = addOpLayer(bridge.editor, `图层 ${store.layerList.length + 1}`);
    if (!r.ok) {
      toast.warn(r.message);
      return;
    }
    toast.success('已新建图层');
  } catch (e) {
    toast.error(`新建图层失败：${String((e as Error).message ?? e)}`);
  }
}
function zoomIn() {
  try {
    zoomInOp(bridge.editor);
  } catch (e) {
    toast.error(`放大失败：${String((e as Error).message ?? e)}`);
  }
}
function zoomOut() {
  try {
    zoomOutOp(bridge.editor);
  } catch (e) {
    toast.error(`缩小失败：${String((e as Error).message ?? e)}`);
  }
}
function fitView() {
  try {
    zoomToFitOp(bridge.editor);
  } catch (e) {
    toast.error(`适配失败：${String((e as Error).message ?? e)}`);
  }
}

// 旋转活动图层。默认顺时针 90°，Shift 修饰 = 逆时针。
async function rotateActive(degrees: number) {
  const activeId = store.activeLayerId;
  if (!activeId) {
    toast.warn('请先选中一个图层');
    return;
  }
  try {
    const r = rotateOpLayer(bridge.editor, activeId, degrees);
    if (!r.ok) {
      toast.warn(r.message);
      return;
    }
    toast.success(`已旋转 ${degrees > 0 ? '顺时针' : '逆时针'} ${Math.abs(degrees)}°`);
  } catch (e) {
    toast.error(`旋转失败：${String((e as Error).message ?? e)}`);
  }
}

// 顶栏「文字」按钮：切到 OpenPencil TEXT（在画布点击放置），不再弹旧像素对话框。
function openTextDialog() {
  const result = activateTool('text');
  if (!result.ok && result.message) {
    toast.info(result.message);
  }
}

// W13：文字对话框确认后回调
async function onTextConfirm(payload: {
  text: string;
  fontSize: number;
  color: string;
  x: number;
  y: number;
}) {
  textDialogOpen.value = false;
  const activeId = store.activeLayerId;
  if (!activeId) return;
  try {
    await canvasApi.addText({
      layerId: activeId,
      text: payload.text,
      x: payload.x,
      y: payload.y,
      fontSize: payload.fontSize,
      color: payload.color,
    });
    toast.success(`已添加文字：${payload.text.slice(0, 12)}${payload.text.length > 12 ? '…' : ''}`);
  } catch (e) {
    toast.error(`添加文字失败：${String((e as Error).message ?? e)}`);
  }
}

// 混合模式切换
async function onBlendModeChange(mode: BlendMode) {
  const activeId = store.activeLayerId;
  if (!activeId) {
    toast.warn('请先选中一个图层');
    return;
  }
  try {
    const r = setLayerBlendMode(bridge.editor, activeId, mode);
    if (!r.ok) {
      toast.warn(r.message);
      return;
    }
    toast.info(`混合模式：${blendModes.find((b) => b.value === mode)?.label ?? mode}`);
  } catch (e) {
    toast.error(`切换混合模式失败：${String((e as Error).message ?? e)}`);
  }
}

const activeBlendMode = computed<BlendMode>(() => {
  const layer = store.layerList.find((l) => l.id === store.activeLayerId);
  return (layer?.blendMode ?? 'normal') as BlendMode;
});
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

    <!-- W13：旋转 / 文字工具入口 -->
    <div class="canvas-toolbar__group">
      <button
        type="button"
        class="canvas-toolbar__btn canvas-toolbar__btn--icon"
        title="逆时针 90° (Shift)"
        aria-label="逆时针旋转 90°"
        @click="rotateActive(-90)"
      >
        <RotateCcw :size="14" />
      </button>
      <button
        type="button"
        class="canvas-toolbar__btn canvas-toolbar__btn--icon"
        title="顺时针 90° (R)"
        aria-label="顺时针旋转 90°"
        @click="rotateActive(90)"
      >
        <RotateCw :size="14" />
      </button>
      <button
        type="button"
        class="canvas-toolbar__btn canvas-toolbar__btn--labeled"
        title="文字输入 (X)"
        aria-label="文字输入"
        @click="openTextDialog"
      >
        <TypeIcon :size="14" />
        <span>文字</span>
      </button>
    </div>

    <span class="canvas-toolbar__sep" aria-hidden="true" />

    <!-- 工具名 + 当前工具参数（靠前，避免被 48px 裁切 / 挤出视口） -->
    <div class="canvas-toolbar__group">
      <span class="canvas-toolbar__tool-label">
        工具：
        <strong>{{ toolLabel }}</strong>
      </span>
    </div>

    <!-- 填充（形状 / 文字 / 选中可填节点） -->
    <template v-if="showFillControls">
      <span class="canvas-toolbar__sep" aria-hidden="true" />
      <div class="canvas-toolbar__group canvas-toolbar__group--props">
        <button
          v-if="store.activeTool !== 'text'"
          type="button"
          class="canvas-toolbar__toggle"
          :class="{ 'is-on': store.fillEnabled }"
          :aria-pressed="store.fillEnabled"
          :title="store.fillEnabled ? '关闭填充' : '开启填充'"
          :aria-label="store.fillEnabled ? '关闭填充' : '开启填充'"
          @click="toggleFillEnabled"
        >
          填充
        </button>
        <span v-else class="canvas-toolbar__label">文字色</span>
        <div class="canvas-toolbar__swatches">
          <button
            v-for="color in swatches"
            :key="`fill-${color}`"
            type="button"
            class="canvas-toolbar__swatch"
            :class="{ 'is-active': store.fillColor === color }"
            :style="{ backgroundColor: color }"
            :title="color"
            :aria-label="`填充颜色 ${color}`"
            @click="pickFillColor(color)"
          />
        </div>
      </div>
    </template>

    <!-- 文字字号 -->
    <template v-if="showTextControls">
      <span class="canvas-toolbar__sep" aria-hidden="true" />
      <div class="canvas-toolbar__group canvas-toolbar__group--props">
        <label class="canvas-toolbar__radius">
          <span class="canvas-toolbar__label">字号</span>
          <input
            type="range"
            min="8"
            max="128"
            step="1"
            :value="store.fontSize"
            :aria-label="`字号 ${store.fontSize}`"
            @input="setFontSize"
          />
          <span class="canvas-toolbar__radius-value">{{ store.fontSize }}</span>
        </label>
      </div>
    </template>

    <!-- 描边（钢笔 / 形状 / 选中路径） -->
    <template v-if="showStrokeControls">
      <span class="canvas-toolbar__sep" aria-hidden="true" />

      <div class="canvas-toolbar__group canvas-toolbar__group--props">
        <button
          v-if="store.activeTool !== 'pen' && store.activeTool !== 'line'"
          type="button"
          class="canvas-toolbar__toggle"
          :class="{ 'is-on': store.strokeEnabled }"
          :aria-pressed="store.strokeEnabled"
          :title="store.strokeEnabled ? '关闭描边' : '开启描边'"
          :aria-label="store.strokeEnabled ? '关闭描边' : '开启描边'"
          @click="toggleStrokeEnabled"
        >
          描边
        </button>
        <span v-else class="canvas-toolbar__label">描边</span>
        <div class="canvas-toolbar__swatches">
          <button
            v-for="color in swatches"
            :key="`stroke-${color}`"
            type="button"
            class="canvas-toolbar__swatch"
            :class="{ 'is-active': store.strokeColor === color }"
            :style="{ backgroundColor: color }"
            :title="color"
            :aria-label="`描边颜色 ${color}`"
            @click="pickStrokeColor(color)"
          />
        </div>
        <label class="canvas-toolbar__radius">
          <span class="canvas-toolbar__label">线宽</span>
          <input
            type="range"
            min="1"
            max="32"
            step="0.5"
            :value="store.strokeWeight"
            :aria-label="`描边线宽 ${store.strokeWeight}`"
            @input="setStrokeWeight"
          />
          <span class="canvas-toolbar__radius-value">{{ store.strokeWeight }}</span>
        </label>
      </div>
    </template>

    <!-- 多边形边数 -->
    <template v-if="showPolygonControls">
      <span class="canvas-toolbar__sep" aria-hidden="true" />
      <div class="canvas-toolbar__group canvas-toolbar__group--props">
        <label class="canvas-toolbar__radius">
          <span class="canvas-toolbar__label">边数</span>
          <input
            type="range"
            min="3"
            max="12"
            step="1"
            :value="store.polygonSides"
            :aria-label="`多边形边数 ${store.polygonSides}`"
            @input="setPolygonSides"
          />
          <span class="canvas-toolbar__radius-value">{{ store.polygonSides }}</span>
        </label>
      </div>
    </template>

    <!-- 星形参数 -->
    <template v-if="showStarControls">
      <span class="canvas-toolbar__sep" aria-hidden="true" />
      <div class="canvas-toolbar__group canvas-toolbar__group--props">
        <label class="canvas-toolbar__radius">
          <span class="canvas-toolbar__label">角数</span>
          <input
            type="range"
            min="3"
            max="12"
            step="1"
            :value="store.starPoints"
            :aria-label="`星形角数 ${store.starPoints}`"
            @input="setStarPoints"
          />
          <span class="canvas-toolbar__radius-value">{{ store.starPoints }}</span>
        </label>
        <label class="canvas-toolbar__radius">
          <span class="canvas-toolbar__label">内径</span>
          <input
            type="range"
            min="0.1"
            max="0.9"
            step="0.05"
            :value="store.starInnerRadius"
            :aria-label="`星形内径 ${store.starInnerRadius}`"
            @input="setStarInner"
          />
          <span class="canvas-toolbar__radius-value">{{ store.starInnerRadius }}</span>
        </label>
      </div>
    </template>

    <!-- 像素工具参数（橡皮 / 油漆桶） -->
    <template v-if="showRasterControls">
      <span class="canvas-toolbar__sep" aria-hidden="true" />

      <div v-if="showBucketControls" class="canvas-toolbar__group">
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

      <div v-if="showEraserSize" class="canvas-toolbar__group">
        <label class="canvas-toolbar__radius">
          <span class="canvas-toolbar__label">粗细</span>
          <input
            type="range"
            min="1"
            max="64"
            step="1"
            :value="store.brushRadius"
            :aria-label="`橡皮粗细 ${store.brushRadius} 像素`"
            @input="setRadius"
          />
          <span class="canvas-toolbar__radius-value">{{ store.brushRadius }}</span>
        </label>
      </div>

      <div v-if="showBucketControls" class="canvas-toolbar__group">
        <label class="canvas-toolbar__radius">
          <span class="canvas-toolbar__label">容差</span>
          <input
            type="range"
            min="0"
            max="128"
            step="1"
            :value="store.bucketTolerance ?? 32"
            :aria-label="`填充容差 ${store.bucketTolerance ?? 32}`"
            @input="setTolerance"
          />
          <span class="canvas-toolbar__radius-value">{{ store.bucketTolerance }}</span>
        </label>
      </div>
    </template>

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
        @click="fitView"
      >
        <Maximize2 :size="14" />
      </button>
    </div>

    <span class="canvas-toolbar__sep" aria-hidden="true" />

    <!-- W13：混合模式下拉（针对活动图层） -->
    <div class="canvas-toolbar__group">
      <label class="canvas-toolbar__blend">
        <span class="canvas-toolbar__label">混合</span>
        <select
          class="canvas-toolbar__select"
          :value="activeBlendMode"
          aria-label="图层混合模式"
          :disabled="!store.activeLayerId"
          @change="onBlendModeChange(($event.target as HTMLSelectElement).value as BlendMode)"
        >
          <option v-for="m in blendModes" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
        <ChevronDown :size="12" class="canvas-toolbar__select-caret" aria-hidden="true" />
      </label>
    </div>

    <!-- W13：文字输入对话框（Teleport 到 body） -->
    <TextInputDialog
      :open="textDialogOpen"
      :default-color="store.brushColor"
      @update:open="textDialogOpen = $event"
      @confirm="onTextConfirm"
    />
  </div>
</template>

<style scoped lang="scss">
.canvas-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap; /* W13：窄屏下允许换行，避免被右栏遮挡 */
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  font-size: var(--font-size-sm);
  min-height: 36px;
  row-gap: 6px; /* 换行后组与组之间间距 */
  overflow: visible;

  &__group {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;

    &--props {
      flex-wrap: wrap;
      row-gap: 4px;
      padding: 2px 8px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-sm);
    }
  }

  &__toggle {
    height: 22px;
    padding: 0 8px;
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;

    &.is-on {
      color: var(--text-primary);
      border-color: var(--accent-color, #6c5ce7);
      background: color-mix(in srgb, var(--accent-color, #6c5ce7) 18%, transparent);
    }
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

  /* W13：混合模式下拉 */
  &__blend {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    position: relative;
  }

  &__select {
    appearance: none;
    -webkit-appearance: none;
    height: 26px;
    padding: 0 22px 0 8px;
    font-size: var(--font-size-xs);
    color: var(--text-primary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
      border-color: var(--accent);
    }

    &:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__select-caret {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    color: var(--text-muted);
  }

  /* 窄屏（< 1024px）隐藏次要元素，避免工具条继续拥挤 */
  @media (max-width: 1024px) {
    &__label {
      display: none;
    }
  }
}
</style>
