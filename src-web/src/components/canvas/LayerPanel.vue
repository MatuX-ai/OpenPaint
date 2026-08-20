<!--
  Layer panel.
  Shows the synced layer list from the canvas store and provides
  add/remove actions. Selecting a layer asks the backend to make it
  the new active layer.
-->

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Plus, Trash2 } from 'lucide-vue-next';
import { useCanvasStore } from '@stores/canvasStore';
import { canvasApi } from '@api/index';
import LayerItem from './LayerItem.vue';

const store = useCanvasStore();
const isAdding = ref(false);

const layers = computed(() => [...store.layerList].reverse()); // top-most first

async function addLayer() {
  if (isAdding.value) return;
  isAdding.value = true;
  try {
    const id = await canvasApi.addLayer(`Layer ${store.layerList.length + 1}`);
    store.activeLayerId = id;
  } catch (e) {
    console.error('[LayerPanel] addLayer failed:', e);
  } finally {
    isAdding.value = false;
  }
}

async function removeActive() {
  if (store.layerList.length <= 1) {
    console.warn('[LayerPanel] cannot remove last layer');
    return;
  }
  try {
    await canvasApi.removeActiveLayer();
  } catch (e) {
    console.error('[LayerPanel] removeActiveLayer failed:', e);
  }
}

/** Optimistically flip visibility in the store; the backend is the source of truth. */
function onVisibilityChanged(layerId: string, visible: boolean) {
  const layer = store.layerList.find((l) => l.id === layerId);
  if (layer) layer.visible = visible;
}
</script>

<template>
  <aside class="layer-panel">
    <header class="layer-panel__header">
      <span class="layer-panel__title">图层</span>
      <div class="layer-panel__actions">
        <button
          class="layer-panel__btn"
          type="button"
          title="新增图层"
          :disabled="isAdding"
          @click="addLayer"
        >
          <Plus :size="14" />
        </button>
        <button
          class="layer-panel__btn"
          type="button"
          title="删除活动图层"
          :disabled="layers.length <= 1"
          @click="removeActive"
        >
          <Trash2 :size="14" />
        </button>
      </div>
    </header>

    <ul v-if="layers.length" class="layer-panel__list">
      <LayerItem
        v-for="layer in layers"
        :key="layer.id"
        :layer="layer"
        @visibility-changed="onVisibilityChanged"
      />
    </ul>

    <div v-else class="layer-panel__empty">
      <p>暂无图层</p>
      <small>点击右上 + 创建第一个图层</small>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.layer-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-secondary);

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-color);
  }

  &__title {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  &__actions {
    display: inline-flex;
    gap: 2px;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);

    &:hover:not(:disabled) {
      background: var(--bg-hover);
      color: var(--text-primary);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  &__list {
    flex: 1;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: auto;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: var(--space-1);
    color: var(--text-muted);

    small {
      font-size: var(--font-size-xs);
    }
  }
}
</style>
