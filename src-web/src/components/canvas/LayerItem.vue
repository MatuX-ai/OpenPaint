<!--
  LayerItem — single row in the LayerPanel list.

  W13 UX 验收补齐：
    - 锁按钮真正切换状态（之前只有 @click.stop 是死按钮）
    - 不透明度改为可拖动滑块（之前只显示不让改）
    - 右键菜单：旋转 90° / 旋转 -90° / 删除 / 复制占位 / 切换锁定 / 切换可见性
    - Blend Mode 下拉直接暴露在行内（可选，避免与右键菜单冗余）

  触发的事件：
    - visibility-changed: { layerId, visible }
    - locked-changed: { layerId, locked }
    - opacity-changed: { layerId, opacity }
    - rotate-request: { layerId, degrees }
    - delete-request: { layerId }
    - context-menu: { event, layerId }（由父组件 LayerPanel 决定是否弹出菜单）
-->

<script setup lang="ts">
import { computed } from 'vue';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-vue-next';
import { useCanvasStore } from '@stores/canvasStore';
import { useToast } from '@composables/useToast';
import { canvasApi } from '@api/index';
import type { Layer, BlendMode } from '@/types/canvas';

const props = defineProps<{ layer: Layer }>();
const emit = defineEmits<{
  'visibility-changed': [layerId: string, visible: boolean];
  'locked-changed': [layerId: string, locked: boolean];
  'opacity-changed': [layerId: string, opacity: number];
  'blend-changed': [layerId: string, mode: BlendMode];
  'rotate-request': [layerId: string, degrees: number];
  'delete-request': [layerId: string];
  'context-menu': [event: MouseEvent, layerId: string];
}>();

const store = useCanvasStore();
const toast = useToast();

const isActive = computed(() => props.layer.isActive || props.layer.id === store.activeLayerId);

const blendModes: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: '正常' },
  { value: 'multiply', label: '正片叠底' },
  { value: 'screen', label: '滤色' },
  { value: 'overlay', label: '叠加' },
];

// ---- 锁切换 ----
async function toggleLocked(e: Event) {
  e.stopPropagation();
  const next = !props.layer.locked;
  // 乐观更新：先改 store，再发 IPC
  emit('locked-changed', props.layer.id, next);
  try {
    await canvasApi.setLayerLocked(props.layer.id, next);
  } catch (err) {
    // IPC 失败时回滚
    emit('locked-changed', props.layer.id, !next);
    toast.error(`切换锁定失败：${String((err as Error).message ?? err)}`);
  }
}

// ---- 可见性切换 ----
async function toggleVisible(e: Event) {
  e.stopPropagation();
  const next = !props.layer.visible;
  emit('visibility-changed', props.layer.id, next);
  try {
    await canvasApi.setLayerVisibility(props.layer.id, next);
  } catch (err) {
    emit('visibility-changed', props.layer.id, !next);
    toast.error(`切换可见性失败：${String((err as Error).message ?? err)}`);
  }
}

// ---- 不透明度调节 ----
async function setOpacity(e: Event) {
  const value = parseInt((e.target as HTMLInputElement).value, 10);
  const next = value / 100;
  emit('opacity-changed', props.layer.id, next);
  try {
    await canvasApi.setLayerOpacity(props.layer.id, next);
  } catch (err) {
    emit('opacity-changed', props.layer.id, props.layer.opacity);
    toast.error(`调节不透明度失败：${String((err as Error).message ?? err)}`);
  }
}

// ---- 混合模式 ----
async function setBlendMode(e: Event) {
  e.stopPropagation();
  const next = (e.target as HTMLSelectElement).value as BlendMode;
  emit('blend-changed', props.layer.id, next);
  try {
    await canvasApi.setLayerBlendMode(props.layer.id, next);
  } catch (err) {
    toast.error(`切换混合模式失败：${String((err as Error).message ?? err)}`);
  }
}

// ---- 选中 ----
async function select() {
  try {
    await canvasApi.setActiveLayer(props.layer.id);
    store.activeLayerId = props.layer.id;
  } catch (e) {
    console.error('[LayerItem] setActiveLayer failed:', e);
  }
}

// ---- 右键菜单：转发到父组件（由 LayerPanel 弹 ContextMenu） ----
function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  emit('context-menu', e, props.layer.id);
}
</script>

<template>
  <li
    class="layer-item"
    :class="{
      'is-active': isActive,
      'is-locked': layer.locked,
      'is-hidden': !layer.visible,
    }"
    @click="select"
    @contextmenu="onContextMenu"
  >
    <button
      class="layer-item__icon-btn"
      type="button"
      :title="layer.visible ? '隐藏图层' : '显示图层'"
      :aria-label="layer.visible ? '隐藏图层' : '显示图层'"
      @click="toggleVisible"
    >
      <Eye v-if="layer.visible" :size="14" />
      <EyeOff v-else :size="14" />
    </button>
    <button
      class="layer-item__icon-btn layer-item__icon-btn--lock"
      type="button"
      :title="layer.locked ? '解锁图层' : '锁定图层'"
      :aria-label="layer.locked ? '解锁图层' : '锁定图层'"
      :aria-pressed="layer.locked"
      @click="toggleLocked"
    >
      <Lock v-if="layer.locked" :size="14" />
      <Unlock v-else :size="14" />
    </button>
    <div class="layer-item__main">
      <div class="layer-item__name-row">
        <span class="layer-item__name">{{ layer.name }}</span>
        <select
          class="layer-item__blend"
          :value="layer.blendMode ?? 'normal'"
          aria-label="混合模式"
          @click.stop
          @change="setBlendMode"
        >
          <option v-for="m in blendModes" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>
      <div class="layer-item__opacity-row">
        <input
          class="layer-item__opacity-slider"
          type="range"
          min="0"
          max="100"
          step="1"
          :value="Math.round(layer.opacity * 100)"
          :aria-label="`不透明度 ${Math.round(layer.opacity * 100)}%`"
          :title="`不透明度 ${Math.round(layer.opacity * 100)}%`"
          @click.stop
          @input="setOpacity"
        />
        <span class="layer-item__opacity-value">{{ Math.round(layer.opacity * 100) }}%</span>
      </div>
    </div>
  </li>
</template>

<style scoped lang="scss">
.layer-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  border-left: 2px solid transparent;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.is-active {
    background: var(--accent-light);
    color: var(--accent);
    border-left-color: var(--accent);
  }

  &.is-locked {
    opacity: 0.85;
  }

  &.is-hidden {
    opacity: 0.55;
  }

  &__icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: inherit;
    border-radius: var(--radius-sm);

    &:hover {
      background: var(--bg-hover);
    }

    &--lock.is-active {
      color: var(--color-warn, #fdcb6e);
    }
  }

  &__main {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  &__name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  &__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__blend {
    appearance: none;
    -webkit-appearance: none;
    height: 18px;
    padding: 0 4px;
    font-size: 10px;
    color: var(--text-secondary);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 3px;
    cursor: pointer;

    &:hover {
      border-color: var(--accent);
    }

    &:focus {
      outline: 1px solid var(--accent);
    }
  }

  &__opacity-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__opacity-slider {
    flex: 1;
    height: 4px;
    accent-color: var(--accent);
    cursor: pointer;
  }

  &__opacity-value {
    min-width: 32px;
    text-align: right;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
}
</style>
