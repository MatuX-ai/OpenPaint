<!--
  LayerItem — single row in the LayerPanel list.
  Toggles visibility and selects the layer as active.
-->

<script setup lang="ts">
import { Eye, EyeOff, Lock, Unlock } from 'lucide-vue-next';
import { useCanvasStore } from '@stores/canvasStore';
import { canvasApi } from '@api/index';
import type { Layer } from '@/types/canvas';

const props = defineProps<{ layer: Layer }>();
const emit = defineEmits<{
  'visibility-changed': [layerId: string, visible: boolean];
}>();
const store = useCanvasStore();

const isActive = () => props.layer.isActive || props.layer.id === store.activeLayerId;

async function toggleVisible() {
  try {
    await canvasApi.setLayerVisibility(props.layer.id, !props.layer.visible);
    // The next backend refresh reconciles the store; emit a local update
    // through the parent instead of mutating the prop directly.
    emit('visibility-changed', props.layer.id, !props.layer.visible);
  } catch (e) {
    console.error('[LayerItem] setLayerVisibility failed:', e);
  }
}

async function select() {
  try {
    await canvasApi.setActiveLayer(props.layer.id);
    store.activeLayerId = props.layer.id;
  } catch (e) {
    console.error('[LayerItem] setActiveLayer failed:', e);
  }
}
</script>

<template>
  <li
    class="layer-item"
    :class="{ 'is-active': isActive() }"
    @click="select"
  >
    <button
      class="layer-item__icon-btn"
      type="button"
      :title="layer.visible ? '隐藏图层' : '显示图层'"
      @click.stop="toggleVisible"
    >
      <Eye v-if="layer.visible" :size="14" />
      <EyeOff v-else :size="14" />
    </button>
    <button
      class="layer-item__icon-btn layer-item__icon-btn--lock"
      type="button"
      :title="layer.locked ? '已锁定' : '未锁定'"
      @click.stop
    >
      <Lock v-if="layer.locked" :size="14" />
      <Unlock v-else :size="14" />
    </button>
    <span class="layer-item__name">{{ layer.name }}</span>
    <span class="layer-item__opacity">{{ Math.round(layer.opacity * 100) }}%</span>
  </li>
</template>

<style scoped lang="scss">
.layer-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  transition: background var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.is-active {
    background: var(--accent-light);
    color: var(--accent);
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

    &--lock { opacity: 0.7; }
  }

  &__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__opacity {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--text-muted);
  }
}
</style>