<!--
  Layer panel.
  Shows the synced layer list from the canvas store and provides
  add/remove actions. Selecting a layer asks the backend to make it
  the new active layer.

  W13 UX 验收补齐：
    - 接收 LayerItem 的锁定 / 不透明度 / 混合模式变更事件，转发到 IPC
    - 在图层项上右键弹出通用 ContextMenu（旋转 90° / -90° / 删除 / 复制占位）
-->

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Plus, Trash2, RotateCw, RotateCcw, Copy } from 'lucide-vue-next';
import { useCanvasStore } from '@stores/canvasStore';
import { useToast } from '@composables/useToast';
import { canvasApi } from '@api/index';
import LayerItem from './LayerItem.vue';
import ContextMenu, { type ContextMenuItem } from '@/components/common/ContextMenu.vue';
import type { BlendMode } from '@/types/canvas';

const store = useCanvasStore();
const toast = useToast();

const isAdding = ref(false);

// 右键菜单状态
const menuState = ref<{ visible: boolean; x: number; y: number; layerId: string }>({
  visible: false,
  x: 0,
  y: 0,
  layerId: '',
});

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

// ---- LayerItem 事件 handlers ----

function onVisibilityChanged(layerId: string, visible: boolean) {
  const layer = store.layerList.find((l) => l.id === layerId);
  if (layer) layer.visible = visible;
}

function onLockedChanged(layerId: string, locked: boolean) {
  const layer = store.layerList.find((l) => l.id === layerId);
  if (layer) layer.locked = locked;
}

function onOpacityChanged(layerId: string, opacity: number) {
  const layer = store.layerList.find((l) => l.id === layerId);
  if (layer) layer.opacity = opacity;
}

function onBlendChanged(layerId: string, mode: BlendMode) {
  const layer = store.layerList.find((l) => l.id === layerId);
  if (layer) layer.blendMode = mode;
}

async function onRotateRequest(layerId: string, degrees: number) {
  try {
    await canvasApi.rotateLayer(layerId, degrees);
    toast.success(`已旋转 ${degrees > 0 ? '顺时针' : '逆时针'} ${Math.abs(degrees)}°`);
  } catch (e) {
    toast.error(`旋转失败：${String((e as Error).message ?? e)}`);
  }
}

async function onDeleteRequest(layerId: string) {
  if (store.layerList.length <= 1) {
    toast.warn('至少保留一个图层');
    return;
  }
  // 选中要删除的图层后调用 removeActiveLayer
  try {
    await canvasApi.setActiveLayer(layerId);
    store.activeLayerId = layerId;
    await canvasApi.removeActiveLayer();
  } catch (e) {
    toast.error(`删除失败：${String((e as Error).message ?? e)}`);
  }
}

function onDuplicateRequest(_layerId: string) {
  // TODO(W13+): 复制图层需要后端 duplicate_layer IPC，当前 mock toast 即可
  toast.info('复制图层：W14+ 提供');
}

// ---- 右键菜单 ----

function onContextMenu(event: MouseEvent, layerId: string) {
  menuState.value = { visible: true, x: event.clientX, y: event.clientY, layerId };
}

function closeMenu() {
  menuState.value = { ...menuState.value, visible: false };
}

function buildMenuItems(layerId: string): ContextMenuItem[] {
  const layer = store.layerList.find((l) => l.id === layerId);
  const hasMultipleLayers = store.layerList.length > 1;
  return [
    {
      label: '顺时针旋转 90°',
      icon: RotateCw,
      shortcut: 'R',
      onSelect: () => onRotateRequest(layerId, 90),
    },
    {
      label: '逆时针旋转 90°',
      icon: RotateCcw,
      shortcut: 'Shift+R',
      onSelect: () => onRotateRequest(layerId, -90),
    },
    { label: '', separator: true },
    {
      label: '复制图层',
      icon: Copy,
      disabled: true,
      onSelect: () => onDuplicateRequest(layerId),
    },
    {
      label: layer?.locked ? '解锁图层' : '锁定图层',
      icon: layer?.locked ? undefined : undefined,
      onSelect: () => onLockedChanged(layerId, !layer?.locked),
    },
    {
      label: layer?.visible ? '隐藏图层' : '显示图层',
      onSelect: () => onVisibilityChanged(layerId, !layer?.visible),
    },
    { label: '', separator: true },
    {
      label: '删除图层',
      icon: Trash2,
      danger: true,
      disabled: !hasMultipleLayers,
      onSelect: () => onDeleteRequest(layerId),
    },
  ];
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
        @locked-changed="onLockedChanged"
        @opacity-changed="onOpacityChanged"
        @blend-changed="onBlendChanged"
        @rotate-request="onRotateRequest"
        @delete-request="onDeleteRequest"
        @context-menu="onContextMenu"
      />
    </ul>

    <div v-else class="layer-panel__empty">
      <p>暂无图层</p>
      <small>点击右上 + 创建第一个图层</small>
    </div>

    <ContextMenu
      :visible="menuState.visible"
      :x="menuState.x"
      :y="menuState.y"
      :items="buildMenuItems(menuState.layerId)"
      @close="closeMenu"
    />
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
